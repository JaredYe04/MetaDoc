export async function toBase64(imgUrl) {
    //把图片转化为base64

    return new Promise((resolve, reject) => {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        var img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = function () {
            canvas.height = img.height;
            canvas.width = img.width;
            ctx.drawImage(img, 0, 0);
            var dataURL = canvas.toDataURL('image/png');
            resolve(dataURL);
        };
        img.src = imgUrl;
    });
}

export function convertBase64ToBlob(base64, type) {
    //将base64转化为blob
    var base64Arr = base64.split(',');
    var imgtype = '';
    var base64String = '';
    if (base64Arr.length > 1) {
        //如果是图片base64，去掉头信息
        base64String = base64Arr[1];
        imgtype = base64Arr[0].substring(base64Arr[0].indexOf(':') + 1, base64Arr[0].indexOf(';'));
    }
    // 将base64解码
    var bytes = atob(base64String);
    var bytesCode = new ArrayBuffer(bytes.length);
    // 转换为类型化数组
    var byteArray = new Uint8Array(bytesCode);
    // 将base64转换为ascii码
    for (var i = 0; i < bytes.length; i++) {
        byteArray[i] = bytes.charCodeAt(i);
    }
    // 生成Blob对象（文件对象）
    return new Blob([bytesCode], { type: type || imgtype });
        // //console.log(base64);
        // var bytes = window.atob(base64);
        // var ab = new ArrayBuffer(bytes.length);
        // var ia = new Uint8Array(ab);
        // for (var i = 0; i < bytes.length; i++) {
        //   ia[i] = bytes.charCodeAt(i);
        // }
        // return new Blob([ab], {
        //   type: type,
        // });
  }
