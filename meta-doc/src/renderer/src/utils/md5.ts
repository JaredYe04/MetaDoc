export function calc_md5(str: string): string {
  // 引用自 JavaScript 实现的 MD5 算法，兼容浏览器和 Electron
  function rotateLeft(lValue: number, iShiftBits: number) {
    return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits))
  }

  function addUnsigned(lX: number, lY: number) {
    const lX4 = lX & 0x40000000
    const lY4 = lY & 0x40000000
    const lX8 = lX & 0x80000000
    const lY8 = lY & 0x80000000
    const lResult = (lX & 0x3fffffff) + (lY & 0x3fffffff)
    if (lX4 & lY4) return lResult ^ 0x80000000 ^ lX8 ^ lY8
    if (lX4 | lY4) {
      if (lResult & 0x40000000) return lResult ^ 0xc0000000 ^ lX8 ^ lY8
      else return lResult ^ 0x40000000 ^ lX8 ^ lY8
    }
    return lResult ^ lX8 ^ lY8
  }

  function F(x: number, y: number, z: number) {
    return (x & y) | (~x & z)
  }
  function G(x: number, y: number, z: number) {
    return (x & z) | (y & ~z)
  }
  function H(x: number, y: number, z: number) {
    return x ^ y ^ z
  }
  function I(x: number, y: number, z: number) {
    return y ^ (x | ~z)
  }

  function FF(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
    a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac))
    return addUnsigned(rotateLeft(a, s), b)
  }

  function GG(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
    a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac))
    return addUnsigned(rotateLeft(a, s), b)
  }

  function HH(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
    a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac))
    return addUnsigned(rotateLeft(a, s), b)
  }

  function II(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
    a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac))
    return addUnsigned(rotateLeft(a, s), b)
  }

  function convertToWordArray(str: string) {
    const lWordCount = (((str.length + 8) >>> 6) + 1) * 16
    const lWordArray = new Array(lWordCount - 1)
    let lBytePosition = 0
    let lByteCount = 0
    while (lByteCount < str.length) {
      const wordIndex = lByteCount >>> 2
      lWordArray[wordIndex] |= (str.charCodeAt(lByteCount) & 0xff) << ((lByteCount % 4) * 8)
      lByteCount++
    }
    const wordIndex = lByteCount >>> 2
    lWordArray[wordIndex] |= 0x80 << ((lByteCount % 4) * 8)
    lWordArray[lWordCount - 2] = str.length << 3
    lWordArray[lWordCount - 1] = str.length >>> 29
    return lWordArray
  }

  function wordToHex(lValue: number) {
    let wordToHexValue = '',
      wordToHexValueTemp = '',
      lByte,
      lCount
    for (lCount = 0; lCount <= 3; lCount++) {
      lByte = (lValue >>> (lCount * 8)) & 255
      wordToHexValueTemp = '0' + lByte.toString(16)
      wordToHexValue += wordToHexValueTemp.substr(wordToHexValueTemp.length - 2, 2)
    }
    return wordToHexValue
  }

  // Main algorithm
  let x = convertToWordArray(str)
  let a = 0x67452301
  let b = 0xefcdab89
  let c = 0x98badcfe
  let d = 0x10325476

  for (let k = 0; k < x.length; k += 16) {
    const AA = a,
      BB = b,
      CC = c,
      DD = d
    a = FF(a, b, c, d, x[k + 0], 7, 0xd76aa478)
    a = FF(a, b, c, d, x[k + 1], 12, 0xe8c7b756)
    a = FF(a, b, c, d, x[k + 2], 17, 0x242070db)
    a = FF(a, b, c, d, x[k + 3], 22, 0xc1bdceee)
    a = FF(a, b, c, d, x[k + 4], 7, 0xf57c0faf)
    a = FF(a, b, c, d, x[k + 5], 12, 0x4787c62a)
    a = FF(a, b, c, d, x[k + 6], 17, 0xa8304613)
    a = FF(a, b, c, d, x[k + 7], 22, 0xfd469501)
    a = FF(a, b, c, d, x[k + 8], 7, 0x698098d8)
    a = FF(a, b, c, d, x[k + 9], 12, 0x8b44f7af)
    a = FF(a, b, c, d, x[k + 10], 17, 0xffff5bb1)
    a = FF(a, b, c, d, x[k + 11], 22, 0x895cd7be)
    a = FF(a, b, c, d, x[k + 12], 7, 0x6b901122)
    a = FF(a, b, c, d, x[k + 13], 12, 0xfd987193)
    a = FF(a, b, c, d, x[k + 14], 17, 0xa679438e)
    a = FF(a, b, c, d, x[k + 15], 22, 0x49b40821)

    a = GG(a, b, c, d, x[k + 1], 5, 0xf61e2562)
    a = GG(a, b, c, d, x[k + 6], 9, 0xc040b340)
    a = GG(a, b, c, d, x[k + 11], 14, 0x265e5a51)
    a = GG(a, b, c, d, x[k + 0], 20, 0xe9b6c7aa)
    a = GG(a, b, c, d, x[k + 5], 5, 0xd62f105d)
    a = GG(a, b, c, d, x[k + 10], 9, 0x02441453)
    a = GG(a, b, c, d, x[k + 15], 14, 0xd8a1e681)
    a = GG(a, b, c, d, x[k + 4], 20, 0xe7d3fbc8)
    a = GG(a, b, c, d, x[k + 9], 5, 0x21e1cde6)
    a = GG(a, b, c, d, x[k + 14], 9, 0xc33707d6)
    a = GG(a, b, c, d, x[k + 3], 14, 0xf4d50d87)
    a = GG(a, b, c, d, x[k + 8], 20, 0x455a14ed)
    a = GG(a, b, c, d, x[k + 13], 5, 0xa9e3e905)
    a = GG(a, b, c, d, x[k + 2], 9, 0xfcefa3f8)
    a = GG(a, b, c, d, x[k + 7], 14, 0x676f02d9)
    a = GG(a, b, c, d, x[k + 12], 20, 0x8d2a4c8a)

    a = HH(a, b, c, d, x[k + 5], 4, 0xfffa3942)
    a = HH(a, b, c, d, x[k + 8], 11, 0x8771f681)
    a = HH(a, b, c, d, x[k + 11], 16, 0x6d9d6122)
    a = HH(a, b, c, d, x[k + 14], 23, 0xfde5380c)
    a = HH(a, b, c, d, x[k + 1], 4, 0xa4beea44)
    a = HH(a, b, c, d, x[k + 4], 11, 0x4bdecfa9)
    a = HH(a, b, c, d, x[k + 7], 16, 0xf6bb4b60)
    a = HH(a, b, c, d, x[k + 10], 23, 0xbebfbc70)
    a = HH(a, b, c, d, x[k + 13], 4, 0x289b7ec6)
    a = HH(a, b, c, d, x[k + 0], 11, 0xeaa127fa)
    a = HH(a, b, c, d, x[k + 3], 16, 0xd4ef3085)
    a = HH(a, b, c, d, x[k + 6], 23, 0x04881d05)
    a = HH(a, b, c, d, x[k + 9], 4, 0xd9d4d039)
    a = HH(a, b, c, d, x[k + 12], 11, 0xe6db99e5)
    a = HH(a, b, c, d, x[k + 15], 16, 0x1fa27cf8)
    a = HH(a, b, c, d, x[k + 2], 23, 0xc4ac5665)

    a = II(a, b, c, d, x[k + 0], 6, 0xf4292244)
    a = II(a, b, c, d, x[k + 7], 10, 0x432aff97)
    a = II(a, b, c, d, x[k + 14], 15, 0xab9423a7)
    a = II(a, b, c, d, x[k + 5], 21, 0xfc93a039)
    a = II(a, b, c, d, x[k + 12], 6, 0x655b59c3)
    a = II(a, b, c, d, x[k + 3], 10, 0x8f0ccc92)
    a = II(a, b, c, d, x[k + 10], 15, 0xffeff47d)
    a = II(a, b, c, d, x[k + 1], 21, 0x85845dd1)
    a = II(a, b, c, d, x[k + 8], 6, 0x6fa87e4f)
    a = II(a, b, c, d, x[k + 15], 10, 0xfe2ce6e0)
    a = II(a, b, c, d, x[k + 6], 15, 0xa3014314)
    a = II(a, b, c, d, x[k + 13], 21, 0x4e0811a1)
    a = II(a, b, c, d, x[k + 4], 6, 0xf7537e82)
    a = II(a, b, c, d, x[k + 11], 10, 0xbd3af235)
    a = II(a, b, c, d, x[k + 2], 15, 0x2ad7d2bb)
    a = II(a, b, c, d, x[k + 9], 21, 0xeb86d391)

    a = addUnsigned(a, AA)
    b = addUnsigned(b, BB)
    c = addUnsigned(c, CC)
    d = addUnsigned(d, DD)
  }

  return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase()
}
