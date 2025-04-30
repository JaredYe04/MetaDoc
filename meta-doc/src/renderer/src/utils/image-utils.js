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
}

// 图片类型推断函数
export function getMimeType(bytes) {
  // 检查文件头部字节，推断图片格式
  const header = bytes.slice(0, 4); // 获取文件前4个字节

  // JPEG (开始为 FF D8 FF)
  if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) {
    return 'image/jpeg';
  }

  // PNG (开始为 89 50 4E 47)
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) {
    return 'image/png';
  }

  // GIF (开始为 47 49 46 38)
  if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) {
    return 'image/gif';
  }

  // 其他类型可以继续增加
  return 'application/octet-stream';  // 如果无法确定格式，则返回默认类型
}


//导出svg
export const exportSvg = async (svgElement) => {
  const serializer = new XMLSerializer();
  const svgContent = serializer.serializeToString(svgElement);

  const blob = new Blob([svgContent], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "diagram.svg";
  a.click();
  URL.revokeObjectURL(url);
};

// 导出为 PNG 文件
export const exportPng = async (svgElement,filename='diagram') => {


  const serializer = new XMLSerializer();
  const svgContent = serializer.serializeToString(svgElement);

  // 创建一个隐藏的 Canvas 元素
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  // 设置 Canvas 尺寸与 SVG 相同
  const svgBounds = svgElement.getBBox();
  canvas.width = svgBounds.width + 20; // 为了增加一点空间可以考虑调整
  canvas.height = svgBounds.height + 20;

  // 设置背景颜色为透明
  context.fillStyle = "transparent";
  context.fillRect(0, 0, canvas.width, canvas.height);

  // 将 SVG 转换为 PNG
  const img = new Image();
  const svgBlob = new Blob([svgContent], {
    type: "image/svg+xml;charset=utf-8",
  });

  let reader = new FileReader();
  reader.readAsDataURL(svgBlob);
  reader.onload = function () {
    const value = reader.result;
    img.src = value;

    img.onload = function () {
      // 将 SVG 图像绘制到 Canvas 上的正中心
      context.drawImage(img, 0, 0);

      // 导出 PNG 数据
      const pngData = canvas.toDataURL("image/png");

      // 创建一个下载链接并触发下载
      const link = document.createElement("a");
      link.href = pngData;
      link.download = filename+".png"; // 下载的文件名
      link.click();
    };
  };

  img.onerror = () => {
    console.error("无法加载 SVG 图像");
    URL.revokeObjectURL(url);
  };
};