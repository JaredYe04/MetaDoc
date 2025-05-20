export function calc_md5(str: string): string {
    // 引用自 JavaScript 实现的 MD5 算法，兼容浏览器和 Electron
    function rotateLeft(lValue: number, iShiftBits: number) {
        return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
    }

    function addUnsigned(lX: number, lY: number) {
        const lX4 = lX & 0x40000000;
        const lY4 = lY & 0x40000000;
        const lX8 = lX & 0x80000000;
        const lY8 = lY & 0x80000000;
        const lResult = (lX & 0x3FFFFFFF) + (lY & 0x3FFFFFFF);
        if (lX4 & lY4) return lResult ^ 0x80000000 ^ lX8 ^ lY8;
        if (lX4 | lY4) {
            if (lResult & 0x40000000) return lResult ^ 0xC0000000 ^ lX8 ^ lY8;
            else return lResult ^ 0x40000000 ^ lX8 ^ lY8;
        }
        return lResult ^ lX8 ^ lY8;
    }

    function F(x: number, y: number, z: number) { return (x & y) | (~x & z); }
    function G(x: number, y: number, z: number) { return (x & z) | (y & ~z); }
    function H(x: number, y: number, z: number) { return x ^ y ^ z; }
    function I(x: number, y: number, z: number) { return y ^ (x | ~z); }

    function FF(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
        a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac));
        return addUnsigned(rotateLeft(a, s), b);
    }

    function GG(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
        a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac));
        return addUnsigned(rotateLeft(a, s), b);
    }

    function HH(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
        a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac));
        return addUnsigned(rotateLeft(a, s), b);
    }

    function II(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
        a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac));
        return addUnsigned(rotateLeft(a, s), b);
    }

    function convertToWordArray(str: string) {
        const lWordCount = (((str.length + 8) >>> 6) + 1) * 16;
        const lWordArray = new Array(lWordCount - 1);
        let lBytePosition = 0;
        let lByteCount = 0;
        while (lByteCount < str.length) {
            const wordIndex = (lByteCount >>> 2);
            lWordArray[wordIndex] |= (str.charCodeAt(lByteCount) & 0xFF) << ((lByteCount % 4) * 8);
            lByteCount++;
        }
        const wordIndex = (lByteCount >>> 2);
        lWordArray[wordIndex] |= 0x80 << ((lByteCount % 4) * 8);
        lWordArray[lWordCount - 2] = str.length << 3;
        lWordArray[lWordCount - 1] = str.length >>> 29;
        return lWordArray;
    }

    function wordToHex(lValue: number) {
        let wordToHexValue = '', wordToHexValueTemp = '', lByte, lCount;
        for (lCount = 0; lCount <= 3; lCount++) {
            lByte = (lValue >>> (lCount * 8)) & 255;
            wordToHexValueTemp = '0' + lByte.toString(16);
            wordToHexValue += wordToHexValueTemp.substr(wordToHexValueTemp.length - 2, 2);
        }
        return wordToHexValue;
    }

    // Main algorithm
    let x = convertToWordArray(str);
    let a = 0x67452301;
    let b = 0xEFCDAB89;
    let c = 0x98BADCFE;
    let d = 0x10325476;

    for (let k = 0; k < x.length; k += 16) {
        const AA = a, BB = b, CC = c, DD = d;
        a = FF(a, b, c, d, x[k + 0], 7, 0xD76AA478);
        a = FF(a, b, c, d, x[k + 1], 12, 0xE8C7B756);
        a = FF(a, b, c, d, x[k + 2], 17, 0x242070DB);
        a = FF(a, b, c, d, x[k + 3], 22, 0xC1BDCEEE);
        a = FF(a, b, c, d, x[k + 4], 7, 0xF57C0FAF);
        a = FF(a, b, c, d, x[k + 5], 12, 0x4787C62A);
        a = FF(a, b, c, d, x[k + 6], 17, 0xA8304613);
        a = FF(a, b, c, d, x[k + 7], 22, 0xFD469501);
        a = FF(a, b, c, d, x[k + 8], 7, 0x698098D8);
        a = FF(a, b, c, d, x[k + 9], 12, 0x8B44F7AF);
        a = FF(a, b, c, d, x[k + 10], 17, 0xFFFF5BB1);
        a = FF(a, b, c, d, x[k + 11], 22, 0x895CD7BE);
        a = FF(a, b, c, d, x[k + 12], 7, 0x6B901122);
        a = FF(a, b, c, d, x[k + 13], 12, 0xFD987193);
        a = FF(a, b, c, d, x[k + 14], 17, 0xA679438E);
        a = FF(a, b, c, d, x[k + 15], 22, 0x49B40821);

        a = GG(a, b, c, d, x[k + 1], 5, 0xF61E2562);
        a = GG(a, b, c, d, x[k + 6], 9, 0xC040B340);
        a = GG(a, b, c, d, x[k + 11], 14, 0x265E5A51);
        a = GG(a, b, c, d, x[k + 0], 20, 0xE9B6C7AA);
        a = GG(a, b, c, d, x[k + 5], 5, 0xD62F105D);
        a = GG(a, b, c, d, x[k + 10], 9, 0x02441453);
        a = GG(a, b, c, d, x[k + 15], 14, 0xD8A1E681);
        a = GG(a, b, c, d, x[k + 4], 20, 0xE7D3FBC8);
        a = GG(a, b, c, d, x[k + 9], 5, 0x21E1CDE6);
        a = GG(a, b, c, d, x[k + 14], 9, 0xC33707D6);
        a = GG(a, b, c, d, x[k + 3], 14, 0xF4D50D87);
        a = GG(a, b, c, d, x[k + 8], 20, 0x455A14ED);
        a = GG(a, b, c, d, x[k + 13], 5, 0xA9E3E905);
        a = GG(a, b, c, d, x[k + 2], 9, 0xFCEFA3F8);
        a = GG(a, b, c, d, x[k + 7], 14, 0x676F02D9);
        a = GG(a, b, c, d, x[k + 12], 20, 0x8D2A4C8A);

        a = HH(a, b, c, d, x[k + 5], 4, 0xFFFA3942);
        a = HH(a, b, c, d, x[k + 8], 11, 0x8771F681);
        a = HH(a, b, c, d, x[k + 11], 16, 0x6D9D6122);
        a = HH(a, b, c, d, x[k + 14], 23, 0xFDE5380C);
        a = HH(a, b, c, d, x[k + 1], 4, 0xA4BEEA44);
        a = HH(a, b, c, d, x[k + 4], 11, 0x4BDECFA9);
        a = HH(a, b, c, d, x[k + 7], 16, 0xF6BB4B60);
        a = HH(a, b, c, d, x[k + 10], 23, 0xBEBFBC70);
        a = HH(a, b, c, d, x[k + 13], 4, 0x289B7EC6);
        a = HH(a, b, c, d, x[k + 0], 11, 0xEAA127FA);
        a = HH(a, b, c, d, x[k + 3], 16, 0xD4EF3085);
        a = HH(a, b, c, d, x[k + 6], 23, 0x04881D05);
        a = HH(a, b, c, d, x[k + 9], 4, 0xD9D4D039);
        a = HH(a, b, c, d, x[k + 12], 11, 0xE6DB99E5);
        a = HH(a, b, c, d, x[k + 15], 16, 0x1FA27CF8);
        a = HH(a, b, c, d, x[k + 2], 23, 0xC4AC5665);

        a = II(a, b, c, d, x[k + 0], 6, 0xF4292244);
        a = II(a, b, c, d, x[k + 7], 10, 0x432AFF97);
        a = II(a, b, c, d, x[k + 14], 15, 0xAB9423A7);
        a = II(a, b, c, d, x[k + 5], 21, 0xFC93A039);
        a = II(a, b, c, d, x[k + 12], 6, 0x655B59C3);
        a = II(a, b, c, d, x[k + 3], 10, 0x8F0CCC92);
        a = II(a, b, c, d, x[k + 10], 15, 0xFFEFF47D);
        a = II(a, b, c, d, x[k + 1], 21, 0x85845DD1);
        a = II(a, b, c, d, x[k + 8], 6, 0x6FA87E4F);
        a = II(a, b, c, d, x[k + 15], 10, 0xFE2CE6E0);
        a = II(a, b, c, d, x[k + 6], 15, 0xA3014314);
        a = II(a, b, c, d, x[k + 13], 21, 0x4E0811A1);
        a = II(a, b, c, d, x[k + 4], 6, 0xF7537E82);
        a = II(a, b, c, d, x[k + 11], 10, 0xBD3AF235);
        a = II(a, b, c, d, x[k + 2], 15, 0x2AD7D2BB);
        a = II(a, b, c, d, x[k + 9], 21, 0xEB86D391);

        a = addUnsigned(a, AA);
        b = addUnsigned(b, BB);
        c = addUnsigned(c, CC);
        d = addUnsigned(d, DD);
    }

    return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
}
