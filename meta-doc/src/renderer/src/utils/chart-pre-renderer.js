// 统一的图表预渲染库
// 支持将各种图表代码块（Mermaid、ECharts、flowchart、graphviz、mindmap、markmap、SMILES、abc）预渲染为图片

import Vditor from 'vditor';
import { createRendererLogger } from './logger.ts';
import { isElectronEnv } from './event-bus';
import { localVditorCDN, vditorCDN } from './vditor-cdn';
import mermaid from 'mermaid';
// 移除 dom-to-image 依赖，避免通过 DOM 截图导出路径

// 导出图表类型配置供外部使用
export const CHART_TYPES = {
    plantuml: {
        regex: /```plantuml\s*\n([\s\S]*?)```/g,
        useIpc: true, // 使用主进程 IPC 渲染
        defaultFormat: 'svg', // 默认矢量图
        canConvert: true, // 可以转换为位图
    },
    mermaid: {
        regex: /```mermaid\s*\n([\s\S]*?)```/g,
        useIpc: false, // 使用 Mermaid 官方 API 渲染
        useMermaidApi: true, // 使用 Mermaid 官方 API
        defaultFormat: 'svg', // 默认矢量图
        canConvert: true, // 可以转换为位图
    },
    echarts: {
        regex: /```echarts\s*\n([\s\S]*?)```/g,
        useIpc: true, // 使用主进程 IPC 渲染（ECharts SSR）
        defaultFormat: 'svg', // 默认矢量图（但可以通过 SSR 生成 PNG）
        canConvert: true, // 可以转换为位图
    },
    flowchart: {
        regex: /```flowchart\s*\n([\s\S]*?)```/g,
        useIpc: false,
        vditorMethod: 'flowchartRender',
        defaultFormat: 'svg', // 默认矢量图
        canConvert: true, // 可以转换为位图
    },
    graphviz: {
        regex: /```graphviz\s*\n([\s\S]*?)```/g,
        useIpc: false,
        vditorMethod: 'graphvizRender',
        defaultFormat: 'svg', // 默认矢量图
        canConvert: true, // 可以转换为位图
    },
    mindmap: {
        regex: /```mindmap\s*\n([\s\S]*?)```/g,
        useIpc: false,
        vditorMethod: 'mindmapRender',
        defaultFormat: 'svg', // 默认矢量图
        canConvert: true, // 可以转换为位图
    },
    markmap: {
        regex: /```markmap\s*\n([\s\S]*?)```/g,
        useIpc: false,
        vditorMethod: 'markmapRender',
        defaultFormat: 'svg', // 默认矢量图
        canConvert: true, // 可以转换为位图
    },
    smiles: {
        regex: /```smiles\s*\n([\s\S]*?)```/g,
        useIpc: false,
        vditorMethod: 'SMILESRender',
        defaultFormat: 'svg', // 默认矢量图
        canConvert: true, // 可以转换为位图
    },
    abc: {
        regex: /```abc\s*\n([\s\S]*?)```/g,
        useIpc: false,
        vditorMethod: 'abcRender',
        defaultFormat: 'svg', // 默认矢量图
        canConvert: true, // 可以转换为位图
    },
};

// 稳定哈希（SHA-256 -> hex），用于生成确定性的文件名
async function computeHash(text) {
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const digest = await crypto.subtle.digest('SHA-256', data);
        const bytes = new Uint8Array(digest);
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    } catch (_) {
        // 退化：简单 hash
        let h = 0;
        for (let i = 0; i < text.length; i++) {
            h = (h * 31 + text.charCodeAt(i)) >>> 0;
        }
        return ('00000000' + h.toString(16)).slice(-8);
    }
}

/**
 * 使用主进程 IPC 渲染 PlantUML
 * @param {string} code - PlantUML 代码
 * @param {'svg'|'png'} format - 格式：'svg' 或 'png'
 */
export async function renderPlantUMLViaIpc(code, format = 'svg') {
    let ipcRenderer = null;
    if (window && window.electron) {
        ipcRenderer = window.electron.ipcRenderer;
    } else {
        const localIpcRenderer = (await import('./web-adapter/local-ipc-renderer.ts')).default;
        ipcRenderer = localIpcRenderer;
    }
    
    if (!ipcRenderer) {
        throw new Error('无法获取 IPC 渲染器');
    }
    
    return await ipcRenderer.invoke('render-plantuml', code, format);
}

/**
 * 使用主进程 IPC 渲染 ECharts（SSR）
 * @param {string} optionJson - ECharts option 的 JSON 字符串
 * @param {string} format - 格式：'svg' 或 'png'
 */
export async function renderEChartsViaIpc(optionJson, format = 'svg') {
    let ipcRenderer = null;
    if (window && window.electron) {
        ipcRenderer = window.electron.ipcRenderer;
    } else {
        const localIpcRenderer = (await import('./web-adapter/local-ipc-renderer.ts')).default;
        ipcRenderer = localIpcRenderer;
    }
    
    if (!ipcRenderer) {
        throw new Error('无法获取 IPC 渲染器');
    }
    
    // 主进程只返回 SVG 字符串，PNG 转换在渲染进程中完成
    let svgContent = await ipcRenderer.invoke('render-echarts', optionJson);
    
    // 检查返回的是否是 URL（错误情况）
    if (typeof svgContent === 'string' && svgContent.startsWith('http://')) {
        // 如果是 URL，需要先获取 SVG 内容
        const response = await fetch(svgContent);
        svgContent = await response.text();
    }

    // 清理 SVG 中的动画和交互元素，确保导出为静态图（避免动画导致 PDF/DOCX/TeX 截帧错误）
    svgContent = cleanSvgForExport(svgContent);
    
    // 基于稳定输入（规范化后的 optionJson 字符串 + 格式）计算哈希
    const ext = format === 'png' ? 'png' : 'svg';
    const hashBase = await computeHash(String(optionJson) + ':echarts:' + ext);

    if (format === 'png') {
        const pngBlob = await convertSvgToPng(svgContent);
        return await uploadImageToLocal(pngBlob, `${hashBase}_echarts.${ext}`);
    } else {
        const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' });
        return await uploadImageToLocal(svgBlob, `${hashBase}_echarts.${ext}`);
    }
}

/**
 * 使用 Mermaid 官方 API 渲染图表
 * @param {string} code - Mermaid 代码
 * @param {'svg'|'png'} format - 格式：'svg' 或 'png'
 * @returns {Promise<string>} 图片 URL
 */
export async function renderMermaidViaApi(code, format = 'svg') {
    const logger = createRendererLogger('MermaidRenderer');
    
    try {
        // 初始化 Mermaid（每次调用都初始化，确保配置正确）
        mermaid.initialize({ 
            startOnLoad: false,
            securityLevel: 'loose' // 允许交互功能
        });
        
        // 先验证语法
        try {
            const parseResult = await mermaid.parse(code, { suppressErrors: false });
            if (!parseResult || !parseResult.diagramType) {
                throw new Error('Mermaid 语法验证失败：无法识别图表类型');
            }
        } catch (parseError) {
            const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
            logger.error('Mermaid 语法验证失败:', errorMsg);
            throw new Error(`Mermaid 语法错误: ${errorMsg}`);
        }
        
        // 生成唯一的 ID
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        
        // 使用 mermaid.render 渲染
        const { svg } = await mermaid.render(id, code);
        
        // 检查 SVG 中是否包含错误信息
        if (svg.includes('syntax error') || svg.includes('Syntax error') || svg.includes('Error:')) {
            // 尝试提取错误信息
            const errorMatch = svg.match(/<text[^>]*>(.*?error.*?)<\/text>/i);
            const errorMsg = errorMatch ? errorMatch[1] : 'Mermaid 渲染失败：检测到语法错误';
            logger.error('Mermaid 渲染检测到错误:', errorMsg);
            throw new Error(`Mermaid 语法错误: ${errorMsg}`);
        }
        
        // 清理 SVG（移除动画等）
        const cleanedSvg = cleanSvgForExport(svg);
        
        // 计算哈希
        const ext = format === 'png' ? 'png' : 'svg';
        const hashBase = await computeHash(String(code) + ':mermaid:' + ext);
        
        if (format === 'png') {
            // 转换为 PNG（使用主进程 resvg）
            let ipcRenderer = null;
            if (window && window.electron) {
                ipcRenderer = window.electron.ipcRenderer;
            } else {
                const localIpcRenderer = (await import('./web-adapter/local-ipc-renderer.ts')).default;
                ipcRenderer = localIpcRenderer;
            }
            if (!ipcRenderer) throw new Error('无法获取 IPC 渲染器');
            
            const ret = await ipcRenderer.invoke('convert-svg-string-to-png', cleanedSvg);
            if (!ret?.success || !ret.url) {
                throw new Error(ret?.error || '主进程 SVG→PNG 失败');
            }
            return ret.url;
        } else {
            // 使用 SVG 矢量图
            const svgBlob = new Blob([cleanedSvg], { type: 'image/svg+xml' });
            return await uploadImageToLocal(svgBlob, `${hashBase}_mermaid.svg`);
        }
    } catch (error) {
        logger.error('Mermaid 渲染失败:', error);
        throw error;
    }
}

/**
 * 使用 Vditor 渲染图表并提取 SVG 或 PNG
 * @param {string} chartType - 图表类型
 * @param {string} code - 图表代码
 * @param {string} cdn - Vditor CDN 地址
 * @param {object} config - 图表配置
 * @param {string} targetFormat - 目标格式：'svg' 或 'png'
 */
export async function renderChartViaVditor(chartType, code, cdn, config, targetFormat = 'svg') {
    // 预先计算稳定哈希，作为目标文件名的一部分
    const ext = targetFormat === 'png' ? 'png' : 'svg';
    const hashBase = await computeHash(String(code) + ':' + chartType + ':' + ext);

    return new Promise((resolve, reject) => {
        // 创建一个隐藏的容器用于渲染
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        container.style.top = '-9999px';
        container.style.width = '800px';
        container.style.height = '600px';
        container.id = `chart-render-${Date.now()}`;
        document.body.appendChild(container);
        
        // 创建临时的 Markdown 代码块
        const codeBlock = `\`\`\`${chartType}\n${code}\n\`\`\``;
        
        // 使用 Vditor.preview 渲染
        Vditor.preview(container, codeBlock, {
            cdn: cdn,
            mode: 'light',
        });
        
            // 等待 preview 完成后再调用对应的渲染方法
            // 对于 mindmap/markmap，需要额外等待时间让动画完成
            const initialDelay = (chartType === 'mindmap' || chartType === 'markmap') ? 1500 : 0;
            setTimeout(() => {
                const renderMethod = config.vditorMethod;
                if (renderMethod && Vditor[renderMethod]) {
                    Vditor[renderMethod](container, cdn);
                }
                
                // 开始检查渲染结果
                // 对于 mindmap/markmap，需要等待更长时间确保动画完成
                const maxWait = (chartType === 'mindmap' || chartType === 'markmap') ? 15000 : 10000; // mindmap 最多等待 15 秒
                const checkInterval = 200;
                let waited = 0;
            
                const checkRender = () => {
                    try {
                        // 尝试找到渲染后的 SVG 元素
                        let svgElement = null;
                        let canvasElement = null;
                        
                        // 不同的图表类型可能有不同的 DOM 结构
                        if (chartType === 'mermaid') {
                            svgElement = container.querySelector('svg.mermaid') || container.querySelector('svg');
                        } else if (chartType === 'echarts') {
                            // ECharts 渲染为 canvas
                            canvasElement = container.querySelector('canvas');
                            if (!canvasElement) {
                                svgElement = container.querySelector('svg');
                            }
                        } else if (chartType === 'flowchart' || chartType === 'graphviz') {
                            svgElement = container.querySelector('svg');
                        } else if (chartType === 'mindmap' || chartType === 'markmap') {
                            svgElement = container.querySelector('svg');
                        } else if (chartType === 'smiles' || chartType === 'abc') {
                            svgElement = container.querySelector('svg');
                        }
                        
                        if (!svgElement && !canvasElement) {
                            // 如果找不到，尝试查找所有 SVG 或 canvas
                            svgElement = container.querySelector('svg');
                            canvasElement = container.querySelector('canvas');
                        }
                        
                        if (svgElement) {
                            // 定义处理 SVG 的函数
                            const processSvgElement = () => {
                                // 对于 mindmap 和 markmap，先在 DOM 中清理动画
                                if (chartType === 'mindmap' || chartType === 'markmap') {
                                    // 在 DOM 中直接清理动画
                                    const allElements = svgElement.querySelectorAll('*');
                                    allElements.forEach(el => {
                                        // 移除 style 中的动画
                                        if (el.hasAttribute('style')) {
                                            let style = el.getAttribute('style') || '';
                                            style = style.replace(/animation[^;]*;?/gi, '');
                                            style = style.replace(/transition[^;]*;?/gi, '');
                                            el.setAttribute('style', style);
                                        }
                                        // 移除 class 中可能包含的动画类（通过设置内联样式覆盖）
                                        if (el.hasAttribute('class')) {
                                            const currentStyle = el.getAttribute('style') || '';
                                            el.setAttribute('style', currentStyle + '; animation: none !important; transition: none !important;');
                                        }
                                    });
                                    
                                    // 移除所有动画元素
                                    const animations = svgElement.querySelectorAll('animate, animateTransform, animateMotion, set');
                                    animations.forEach(el => el.remove());
                                    
                                    // 处理 style 标签
                                    const styleTags = svgElement.querySelectorAll('style');
                                    styleTags.forEach(tag => {
                                        try {
                                            let css = tag.textContent || '';
                                            css = css.replace(/@(-webkit-|-moz-|-o-)?keyframes[\s\S]*?\}\s*\}/gi, '');
                                            css = css.replace(/@keyframes[\s\S]*?\}\s*\}/gi, '');
                                            css = css.replace(/animation\s*:[^;]+;?/gi, '');
                                            css = css.replace(/transition\s*:[^;]+;?/gi, '');
                                            tag.textContent = css;
                                        } catch (_) {}
                                    });
                                    
                                    // 添加覆盖样式
                                    const overrideStyle = document.createElementNS('http://www.w3.org/2000/svg', 'style');
                                    overrideStyle.textContent = '*{animation: none !important; transition: none !important;}';
                                    svgElement.appendChild(overrideStyle);
                                }
                                
                                // 提取 SVG 内容
                                const serializer = new XMLSerializer();
                                let svgContent = serializer.serializeToString(svgElement);

                                // mindmap 和 markmap 可能包含动画/过渡，导出前再次清理为静态
                                if (chartType === 'mindmap' || chartType === 'markmap') {
                                    svgContent = cleanSvgForExport(svgContent);
                                }
                        
                                // 清理临时容器
                                document.body.removeChild(container);
                                
                                if (targetFormat === 'png') {
                                    // 需要转换为 PNG：为避免渲染进程 canvas 污染，Mermaid 走主进程 resvg
                                    if (chartType === 'mermaid') {
                                        (async () => {
                                            try {
                                                let ipcRenderer = null;
                                                if (window && window.electron) {
                                                    ipcRenderer = window.electron.ipcRenderer;
                                                } else {
                                                    const localIpcRenderer = (await import('./web-adapter/local-ipc-renderer.ts')).default;
                                                    ipcRenderer = localIpcRenderer;
                                                }
                                                if (!ipcRenderer) throw new Error('无法获取 IPC 渲染器');
                                                const ret = await ipcRenderer.invoke('convert-svg-string-to-png', svgContent);
                                                if (!ret?.success || !ret.url) throw new Error(ret?.error || '主进程 SVG→PNG 失败');
                                                resolve(ret.url);
                                            } catch (err) {
                                                reject(err);
                                            }
                                        })();
                                    } else {
                                        convertSvgToPng(svgContent)
                                            .then((pngBlob) => {
                                                return uploadImageToLocal(pngBlob, `${hashBase}_${chartType}.png`);
                                            })
                                            .then(resolve)
                                            .catch(reject);
                                    }
                                } else {
                                    // 使用 SVG 矢量图
                                    const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' });
                                    uploadImageToLocal(svgBlob, `${hashBase}_${chartType}.svg`)
                                        .then(resolve)
                                        .catch(reject);
                                }
                            };
                            
                            // 对于 mindmap 和 markmap，等待动画完成后再处理
                            if (chartType === 'mindmap' || chartType === 'markmap') {
                                // 等待动画完成（强制等待一段时间，确保动画状态稳定）
                                setTimeout(() => {
                                    processSvgElement();
                                }, 1000);
                                return; // 提前返回，等待 setTimeout 执行
                            } else {
                                // 非 mindmap/markmap，直接处理
                                processSvgElement();
                                return;
                            }
                    } else if (canvasElement) {
                        // 对于 canvas，根据目标格式处理
                        document.body.removeChild(container);
                        
                        if (targetFormat === 'png') {
                            // 直接导出为 PNG
                            try {
                                const dataURL = canvasElement.toDataURL('image/png');
                                fetch(dataURL)
                                    .then((response) => response.blob())
                                    .then((blob) => {
                                        return uploadImageToLocal(blob, `${hashBase}_${chartType}.png`);
                                    })
                                    .then(resolve)
                                    .catch((error) => {
                                        // 如果 fetch 失败，使用 dataURL 直接转换为 Blob
                                        logger.warn('Fetch dataURL 失败，使用备用方法:', error);
                                        try {
                                            const base64Data = dataURL.split(',')[1];
                                            const byteCharacters = atob(base64Data);
                                            const byteNumbers = new Array(byteCharacters.length);
                                            for (let i = 0; i < byteCharacters.length; i++) {
                                                byteNumbers[i] = byteCharacters.charCodeAt(i);
                                            }
                                            const byteArray = new Uint8Array(byteNumbers);
                                            const blob = new Blob([byteArray], { type: 'image/png' });
                                            
                                            uploadImageToLocal(blob, `${hashBase}_${chartType}.png`)
                                                .then(resolve)
                                                .catch(reject);
                                        } catch (err) {
                                            reject(err);
                                        }
                                    });
                            } catch (error) {
                                // 如果 toDataURL 失败，尝试通过 SVG 转换
                                logger.warn('Canvas toDataURL 失败，尝试通过 SVG 转换:', error);
                                const svg = convertCanvasToSvg(canvasElement);
                                const serializer = new XMLSerializer();
                                const svgContent = serializer.serializeToString(svg);
                                
                                convertSvgToPng(svgContent)
                                    .then((pngBlob) => {
                                        return uploadImageToLocal(pngBlob, `${hashBase}_${chartType}.png`);
                                    })
                                    .then(resolve)
                                    .catch(reject);
                            }
                        } else {
                            // 转换为 SVG
                            const svg = convertCanvasToSvg(canvasElement);
                            const serializer = new XMLSerializer();
                            const svgContent = serializer.serializeToString(svg);
                            
                            const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' });
                            uploadImageToLocal(svgBlob, `${hashBase}_${chartType}.svg`)
                                .then(resolve)
                                .catch(reject);
                        }
                        return;
                    }
                    
                    // 如果还没渲染完成，继续等待
                    waited += checkInterval;
                    if (waited >= maxWait) {
                        document.body.removeChild(container);
                        reject(new Error(`等待 ${chartType} 渲染超时`));
                        return;
                    }
                    
                    setTimeout(checkRender, checkInterval);
                } catch (error) {
                    document.body.removeChild(container);
                    reject(error);
                }
            };
            
            // 延迟开始检查，给渲染方法一些时间
            setTimeout(checkRender, 300);
        }, 200);
    });
}

/**
 * 将 Canvas 转换为 SVG（用于 ECharts 等）
 */
function convertCanvasToSvg(canvas) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', canvas.width);
    svg.setAttribute('height', canvas.height);
    
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', canvas.toDataURL('image/png'));
    image.setAttribute('width', canvas.width);
    image.setAttribute('height', canvas.height);
    
    svg.appendChild(image);
    return svg;
}

/**
 * 清理 SVG 中的动画和交互元素，使其适合静态导出
 */
function cleanSvgForExport(svgContent) {
    // 使用 DOMParser 解析 SVG
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
    
    // 检查解析错误
    const parserError = svgDoc.querySelector('parsererror');
    if (parserError) {
        // 如果解析失败，返回原内容
        console.warn('SVG 解析失败，使用原始内容');
        return svgContent;
    }
    
    const svgElement = svgDoc.documentElement;
    if (!svgElement || svgElement.tagName !== 'svg') {
        return svgContent;
    }
    
    // 移除所有动画元素
    const animations = svgElement.querySelectorAll('animate, animateTransform, animateMotion, set');
    animations.forEach(el => el.remove());
    
    // 移除事件监听器相关的属性
    const eventAttributes = ['onclick', 'onmouseover', 'onmouseout', 'onmousedown', 'onmouseup', 
                             'onload', 'onerror', 'onfocus', 'onblur'];
    const allElements = svgElement.querySelectorAll('*');
    allElements.forEach(el => {
        eventAttributes.forEach(attr => {
            if (el.hasAttribute(attr)) {
                el.removeAttribute(attr);
            }
        });
    });
    
    // 移除 style 中的动画相关属性
    allElements.forEach(el => {
        if (el.hasAttribute('style')) {
            let style = el.getAttribute('style') || '';
            // 移除 animation 和 transition 相关属性
            style = style.replace(/animation[^;]*;?/gi, '');
            style = style.replace(/transition[^;]*;?/gi, '');
            el.setAttribute('style', style);
        }
    });
    // 处理 <style> 标签中的动画：移除 @keyframes 与 animation/transition 规则
    const styleTags = svgElement.querySelectorAll('style');
    styleTags.forEach(tag => {
        try {
            let css = tag.textContent || '';
            // 删除 @keyframes 定义块（含前缀）
            css = css.replace(/@(-webkit-|-moz-|-o-)?keyframes[\s\S]*?\}\s*\}/gi, '');
            css = css.replace(/@keyframes[\s\S]*?\}\s*\}/gi, '');
            // 移除 animation 与 transition 声明
            css = css.replace(/animation\s*:[^;]+;?/gi, '');
            css = css.replace(/transition\s*:[^;]+;?/gi, '');
            tag.textContent = css;
        } catch (_) {}
    });

    // 覆盖样式层面的动画与过渡（ECharts 常通过 @keyframes + class 触发）
    const overrideStyle = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'style');
    overrideStyle.textContent = '*{animation: none !important; transition: none !important;}';
    // 将覆盖样式附加到 <svg> 末尾，确保优先级
    svgElement.appendChild(overrideStyle);
    
    // 确保有明确的宽高
    if (!svgElement.hasAttribute('width') || !svgElement.hasAttribute('height')) {
        const viewBox = svgElement.getAttribute('viewBox');
        if (viewBox) {
            const parts = viewBox.split(/\s+/);
            if (parts.length >= 4) {
                if (!svgElement.hasAttribute('width')) {
                    svgElement.setAttribute('width', parts[2]);
                }
                if (!svgElement.hasAttribute('height')) {
                    svgElement.setAttribute('height', parts[3]);
                }
            }
        } else {
            if (!svgElement.hasAttribute('width')) {
                svgElement.setAttribute('width', '800');
            }
            if (!svgElement.hasAttribute('height')) {
                svgElement.setAttribute('height', '600');
            }
        }
    }
    
    // 序列化回字符串
    const serializer = new XMLSerializer();
    return serializer.serializeToString(svgElement);
}

/**
 * 确保 SVG 内容有正确的格式和尺寸属性
 */
function ensureSvgFormat(svgContent) {
    let svg = (svgContent || '').trim();
    if (!svg) return svgContent;
    if (!/^<svg[\s>]/i.test(svg)) return svg;

    // 补齐 xmlns 命名空间
    if (!/xmlns=/.test(svg)) {
        svg = svg.replace(/<svg([\s>])/i, '<svg xmlns="http://www.w3.org/2000/svg"$1');
    }
    if (!/xmlns:xlink=/.test(svg)) {
        svg = svg.replace(/<svg([\s>])/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"$1');
    }

    const viewBoxMatch = svg.match(/viewBox\s*=\s*["']([^"']+)["']/i);
    const widthAttr = svg.match(/width\s*=\s*["']([^"']+)["']/i);
    const heightAttr = svg.match(/height\s*=\s*["']([^"']+)["']/i);

    let widthPx = null;
    let heightPx = null;

    if (viewBoxMatch) {
        const parts = viewBoxMatch[1].trim().split(/\s+/);
        if (parts.length >= 4) {
            const vbW = parseFloat(parts[2]);
            const vbH = parseFloat(parts[3]);
            if (!isNaN(vbW) && vbW > 0) widthPx = vbW;
            if (!isNaN(vbH) && vbH > 0) heightPx = vbH;
        }
    }

    const parseDim = (val) => {
        if (!val) return null;
        const s = String(val).trim();
        // 避免把百分比等同于像素（如 "100%" -> 100），百分比在导出中会导致尺寸偏小
        if (/%$/.test(s)) return null;
        // 常见单位处理：px（默认）、pt、pc、in、cm、mm
        const unitMatch = s.match(/^([\d.]+)\s*(px|pt|pc|in|cm|mm)?$/i);
        if (!unitMatch) return null;
        const n = parseFloat(unitMatch[1]);
        if (isNaN(n)) return null;
        const unit = (unitMatch[2] || 'px').toLowerCase();
        const unitToPx = {
            px: 1,
            pt: 96 / 72,
            pc: 16,       // 1pc = 16px
            in: 96,       // 1in = 96px
            cm: 96 / 2.54,
            mm: 96 / 25.4,
        };
        const factor = unitToPx[unit] || 1;
        return n * factor;
    };
    if (widthPx == null && widthAttr) widthPx = parseDim(widthAttr[1]);
    if (heightPx == null && heightAttr) heightPx = parseDim(heightAttr[1]);

    if (widthPx == null || heightPx == null) {
        widthPx = widthPx || 800;
        heightPx = heightPx || 600;
    }

    if (widthAttr) {
        svg = svg.replace(/width\s*=\s*["'][^"']+["']/i, `width="${Math.round(widthPx)}"`);
    } else {
        svg = svg.replace(/<svg([^>]*)>/i, `<svg$1 width="${Math.round(widthPx)}">`);
    }
    if (heightAttr) {
        svg = svg.replace(/height\s*=\s*["'][^"']+["']/i, `height="${Math.round(heightPx)}"`);
    } else {
        svg = svg.replace(/<svg([^>]*)>/i, `<svg$1 height="${Math.round(heightPx)}">`);
    }

    return svg;
}

/**
 * 将 SVG 转换为 PNG（位图）
 * 使用 FileReader 和 data URL 方式避免 canvas 污染问题
 */
export async function convertSvgToPng(svgContent) {
    return new Promise((resolve, reject) => {
        try {
            // 确保 SVG 格式正确
            const normalizedSvg = ensureSvgFormat(svgContent);
            
            const svgBlob = new Blob([normalizedSvg], { type: 'image/svg+xml;charset=utf-8' });
            const objectUrl = URL.createObjectURL(svgBlob);
            const img = new Image();
            // 避免跨域资源污染画布
            try { img.crossOrigin = 'anonymous'; } catch (_) {}

            const timeout = setTimeout(() => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error('SVG 图片加载超时'));
            }, 10000);

            img.onload = async function() {
                clearTimeout(timeout);
                try {
                    if (img.decode) {
                        try { await img.decode(); } catch (_) {}
                    }
                    let width = img.naturalWidth || img.width;
                    let height = img.naturalHeight || img.height;
                    if (!width || !height || width < 2 || height < 2) {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(normalizedSvg, 'image/svg+xml');
                        const root = doc.documentElement;
                        const vb = root.getAttribute('viewBox');
                        const w = root.getAttribute('width');
                        const h = root.getAttribute('height');
                        const toNum = (v) => { const n = parseFloat(v || ''); return isNaN(n) ? null : n; };
                        if (vb) {
                            const parts = vb.split(/\s+/);
                            if (parts.length >= 4) {
                                width = toNum(parts[2]) || width || 1920;
                                height = toNum(parts[3]) || height || 1080;
                            }
                        } else {
                            width = toNum(w) || width || 1920;
                            height = toNum(h) || height || 1080;
                        }
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(width));
                    canvas.height = Math.max(1, Math.round(height));
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    URL.revokeObjectURL(objectUrl);
                    try {
                        canvas.toBlob(async (blob) => {
                            if (blob) {
                                resolve(blob);
                                return;
                            }
                            // 回退一：使用 toDataURL
                            try {
                                const dataURL = canvas.toDataURL('image/png');
                                const base64Data = dataURL.split(',')[1];
                                const byteCharacters = atob(base64Data);
                                const byteNumbers = new Array(byteCharacters.length);
                                for (let i = 0; i < byteCharacters.length; i++) {
                                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                                }
                                resolve(new Blob([new Uint8Array(byteNumbers)], { type: 'image/png' }));
                                return;
                            } catch (e1) {
                                reject(new Error('Canvas 转 PNG 失败: ' + (e1.message || String(e1))));
                            }
                        }, 'image/png');
                    } catch (e0) {
                        reject(new Error('Canvas 转 PNG 失败: ' + (e0.message || String(e0))));
                    }
                } catch (err) {
                    URL.revokeObjectURL(objectUrl);
                    reject(new Error('Canvas 操作失败: ' + (err.message || String(err))));
                }
            };

            img.onerror = (error) => {
                clearTimeout(timeout);
                URL.revokeObjectURL(objectUrl);
                console.error('SVG 图片加载失败，SVG 内容预览:', normalizedSvg.substring(0, 200));
                reject(new Error('SVG 图片加载失败: ' + (error.message || '未知错误')));
            };

            img.src = objectUrl;
        } catch (error) {
            reject(new Error('SVG 转 PNG 初始化失败: ' + (error.message || String(error))));
        }
    });
}

/**
 * 将 Vditor.md2html 生成的 HTML 中 class="language-math" 公式渲染为 PNG data URL 图片
 * 仅返回 body 片段（innerHTML），避免上层再次包裹时产生嵌套 HTML
 */
export async function convertLanguageMathHtmlToImages(htmlContent) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        const nodes = Array.from(doc.querySelectorAll('.language-math'));
        if (nodes.length === 0) {
            return doc.body ? doc.body.innerHTML : htmlContent;
        }
        const { renderTexToPngDataUrl } = await import('./math-renderer.js');
        for (const node of nodes) {
            const tex = (node.textContent || '').trim();
            if (!tex) continue;
            const display = node.tagName.toLowerCase() !== 'span';
            const dataUrl = await renderTexToPngDataUrl(tex, display);
            const img = doc.createElement('img');
            img.setAttribute('src', dataUrl);
            if (display) {
                img.style.display = 'block';
                img.style.margin = '8px auto';
            } else {
                img.style.display = 'inline';
                img.style.verticalAlign = 'middle';
            }
            node.replaceWith(img);
        }
        return doc.body ? doc.body.innerHTML : htmlContent;
    } catch (_) {
        return htmlContent;
    }
}
/**
 * 上传 SVG 或 PNG 到本地服务器
 * @param {Blob} imageBlob - 图片 Blob 对象
 * @param {string} fileName - 原始文件名（multer 会自动添加时间戳前缀）
 * @returns {Promise<string>} - 上传后的图片 URL
 */
async function uploadImageToLocal(imageBlob, fileName) {
    // 先检查是否已存在相同文件（基于稳定命名）
    try {
        const headResp = await fetch(`http://localhost:52521/images/${fileName}`, { method: 'HEAD' });
        if (headResp.ok) {
            return `http://localhost:52521/images/${fileName}`;
        }
    } catch (_) {
        // 忽略 HEAD 失败，继续上传
    }

    const formData = new FormData();
    // 使用 File 包装，向后端传递期望的原始文件名，便于服务端保留
    const file = new File([imageBlob], fileName, { type: imageBlob.type || 'application/octet-stream' });
    formData.append('file[]', file, fileName);

    const response = await fetch('http://localhost:52521/api/image/upload?keepName=1', {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        throw new Error(`上传失败: ${response.status}`);
    }

    const result = await response.json();
    if (result.code === 0 && result.data && result.data.succMap) {
        // 如果后端仍然添加了时间戳，我们优先使用我们期望的文件名（若文件名未被占用时）
        const uploadedFileName = Object.keys(result.data.succMap)[0] || fileName;
        return `http://localhost:52521/images/${uploadedFileName}`;
    }

    // 回退：直接返回我们期望的命名路径（适配后端直接保存原名的实现）
    return `http://localhost:52521/images/${fileName}`;
}

/**
 * 预渲染所有图表代码块为图片
 * @param {string} md - Markdown 文本
 * @param {string} cdn - Vditor CDN 地址
 * @param {string} format - 导出格式（已废弃，统一使用 SVG）
 * @returns {Promise<string>} - 处理后的 Markdown 文本
 */
export async function preRenderAllCharts(md, cdn, format = '') {
    const logger = createRendererLogger('ChartPreRenderer');
    logger.debug('开始预渲染所有图表代码块');

    if (!cdn) {
        if (isElectronEnv()) {
            cdn = localVditorCDN;
        } else {
            cdn = vditorCDN;
        }
    }
    
    let processedMd = md;
    const allMatches = [];
    
    // 收集所有图表代码块
    for (const [chartType, config] of Object.entries(CHART_TYPES)) {
        const regex = new RegExp(config.regex.source, 'g');
        let match;
        while ((match = regex.exec(md)) !== null) {
            allMatches.push({
                chartType,
                fullMatch: match[0],
                code: match[1].trim(),
                index: match.index,
                config,
            });
        }
    }
    
    logger.debug(`找到 ${allMatches.length} 个图表代码块`);
    
    if (allMatches.length === 0) {
        logger.debug(`没有找到图表代码块，直接返回原始 Markdown`);
        return md;
    }
    
    // 按索引从后往前排序，避免替换时索引变化
    allMatches.sort((a, b) => b.index - a.index);
    
    // 并发渲染所有图表，完成后统一替换
    const targetFormat = format === 'bitmap' ? 'png' : 'svg';
    const renderTasks = allMatches.map(async ({ chartType, fullMatch, code, config }) => {
        if (!code) {
            logger.warn(`${chartType} 代码块为空，跳过`);
            return { fullMatch, replacement: null, chartType };
        }
        try {
            logger.debug(`开始渲染 ${chartType} 图表，代码长度: ${code.length}`);
            let imageUrl;
            if (config.useIpc) {
                if (chartType === 'echarts') {
                    let optionJson;
                    try {
                        optionJson = JSON.parse(code);
                    } catch (e) {
                        optionJson = code;
                    }
                    imageUrl = await renderEChartsViaIpc(JSON.stringify(optionJson), targetFormat);
                } else if (chartType === 'plantuml') {
                    imageUrl = await renderPlantUMLViaIpc(code, targetFormat);
                } else {
                    throw new Error(`不支持的 IPC 渲染类型: ${chartType}`);
                }
            } else if (config.useMermaidApi && chartType === 'mermaid') {
                // 使用 Mermaid 官方 API 渲染
                logger.debug(`renderMermaidViaApi code: ${code}, targetFormat: ${targetFormat}`);
                imageUrl = await renderMermaidViaApi(code, targetFormat);
            } else {
                // 使用 Vditor 渲染（其他图表类型）
                const chartConfig = CHART_TYPES[chartType];
                logger.debug(`renderChartViaVditor chartType: ${chartType}, code: ${code}, cdn: ${cdn}, chartConfig: ${chartConfig}, targetFormat: ${targetFormat}`);
                imageUrl = await renderChartViaVditor(chartType, code, cdn, chartConfig, targetFormat);
            }
            logger.debug(`${chartType} 图表渲染完成，URL: ${imageUrl}`);
            return { fullMatch, replacement: `![${chartType} Diagram](${imageUrl})`, chartType };
        } catch (error) {
            logger.error(`${chartType} 图表渲染失败:`, error);
            return { fullMatch, replacement: null, chartType };
        }
    });

    const results = await Promise.allSettled(renderTasks);

    // 从后往前替换，避免索引位移问题
    for (const { value } of results) {
        if (value && value.replacement) {
            const { fullMatch, replacement } = value;
            processedMd = processedMd.replace(fullMatch, replacement);
        }
    }
    
    logger.debug('所有图表预渲染完成');
    return processedMd;
}

