//创建一个方法，用于提取字符串中的json字符串，如果json嵌套json，则提取最外层的json字符串
// 例如："{a:{b:{c:1}}}"，提取出"{a:{b:{c:1}}}"，而不是"{b:{c:1}}"

import { getSetting } from "./settings";

// 该方法用于提取json字符串，避免json字符串中包含其他字符导致解析错误，此外需要考虑最外层可能是数组或对象
export function extractOuterJsonString(str) {
    const startIdx = str.search(/[\[{]/); // 查找第一个 { 或 [
    if (startIdx === -1) return null;

    const openChar = str[startIdx];
    const closeChar = openChar === '{' ? '}' : ']';

    let depth = 0;
    for (let i = startIdx; i < str.length; i++) {
        const char = str[i];
        if (char === openChar) {
            depth++;
        } else if (char === closeChar) {
            depth--;
            if (depth === 0) {
                return str.slice(startIdx, i + 1);
            }
        }
    }

    return null; // 未找到匹配闭合的 JSON
}

export function convertNumberToChinese(number) {
    if (typeof number !== 'number' || !Number.isInteger(number)) {
      throw new Error('只支持整数类型');
    }
  
    if (number === 0) return '零';
  
    const units = ['', '十', '百', '千'];
    const sectionUnits = ['', '万', '亿', '兆']; // 可继续扩展
    const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  
    let result = '';
    let sectionIndex = 0;
  
    while (number > 0) {
      const section = number % 10000; // 每四位为一段
      if (section !== 0) {
        const sectionStr = convertSection(section);
        result = sectionStr + sectionUnits[sectionIndex] + result;
      } else if (!result.startsWith('零')) {
        result = '零' + result;
      }
      number = Math.floor(number / 10000);
      sectionIndex++;
    }
  
    // 特殊处理 "一十X" 应为 "十X"
    return result
      .replace(/^一十/, '十')
      .replace(/零+$/g, '') // 去掉末尾多余零
      .replace(/零+/g, '零'); // 合并多个零为一个
  }
  
  function convertSection(section) {
    const units = ['', '十', '百', '千'];
    const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  
    let str = '';
    let zero = false;
  
    for (let i = 0; i < 4; i++) {
      const digit = section % 10;
      if (digit === 0) {
        if (!zero && str !== '') {
          str = '零' + str;
          zero = true;
        }
      } else {
        str = digits[digit] + units[i] + str;
        zero = false;
      }
      section = Math.floor(section / 10);
      if (section === 0) break;
    }
  
    return str;
  }
  



export function removeTitleIndex(title) {
    //通过正则表达式，去除标题开头的数字和点号
    //例如1.1 xxx,去除1.1
    //例如1. xxx,去除1.
    //例如1 xxx,去除1
    //此外需要注意中文的情况，例如一、xxx，去除一、
    //例如一 xxx，去除一
    //例如一. xxx，去除一.
    //例如一.1 xxx，去除一.1
    //例如一.1.1 xxx，去除一.1.1
    //例如十二、1.2.3 xxx，去除十二、1.2.3
    // 匹配规则说明：
    // ^ 开头
    // ([一二三四五六七八九十百千]+[\、\.]?)? 匹配中文数字+可选顿号/点号
    // (\d+(\.\d+)*[\.\、]?)? 匹配数字+点结构+可选点号/顿号
    // \s* 匹配可能存在的空格
    const regex = /^((([一二三四五六七八九十百千]+[\、\.]?)|(\d+(\.\d+)*[\、\.]?))\s*)+/;
    return title.replace(regex, '');
}
