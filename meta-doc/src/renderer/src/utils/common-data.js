import { ref } from 'vue'
import eventBus from '../utils/event-bus'
import { generateMarkdownFromOutlineTree,extractOutlineTreeFromMarkdown } from './md-utils'
export const loggedIn = ref(false)
export const user=ref({
})
export const avatar=ref('')
export const tree_node_schema={
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "DocumentOutlineNode",
  "type": "object",
  "required": ["path", "title", "text", "title_level", "children"],
  "properties": {
    "path": {
      "type": "string",
      "description": "节点的编号路径，根节点为 'dummy'。例如：'1' 表示根节点dummy的第一个子节点，'1.1' 表示1的第一个子节点，'1.1.1' 表示1.1的第一个子节点，以此类推"
    },
    "title": {
      "type": "string",
      "description": "节点对应的标题文字。"
    },
    "text": {
      "type": "string",
      "description": "该节点正文的文本内容，可为空字符串。"
    },
    "title_level": {
      "type": "integer",
      "minimum": 0,
      "description": "标题的层级，0 表示根节点，1 表示一级标题，2 表示二级标题，依此类推。一般来说当前标题层级是上一层+1，但是可能不止+1，例如从一级跳到三级。"
    },
    "children": {
      "type": "array",
      "description": "子节点列表，结构与当前节点相同。",
      "items": {
        "$ref": "#"
      }
    }
  }
}
const default_outline_tree = {
  path: 'dummy',//编号规则：根节点无编号，为dummy，第一级标题编号为1，第二级标题编号为1.1，第三级标题编号为1.1.1，以此类推
  title: '',//当前节点的标题
  text: '',//当前节点的文本内容
  title_level: 0,//当前节点标题的层级，一级标题为1,二级为2，一般来说是上一层+1，但是可能不止+1，例如从一级跳到三级
  children: []//子节点列表，子节点结构和当前相同
}

export const default_resp='### 你好！我是你的AI文档助手！\n告诉我你的任何需求，我会尝试解决。\n';
export const defaultAiChatMessages = [
  {
    "role": "system",
    "content": "你是一个出色的AI文档编辑助手，现在你需要根据一篇现有的文档进行修改、优化，或者是撰写新的文档。按照对话的上下文来做出合适的回应。请按照用户需求进行回答。(用markdown语言）"
  },
  {
    "role": "assistant",
    "content": default_resp
  }
]



export const firstLoad = ref(true)

const default_artical_meta_data = {
  title: '',
  author: '',
  description: ''
}

var current_file_path = ref('')
var current_outline_tree = ref(JSON.parse(JSON.stringify(default_outline_tree)))
var current_article = ref(generateMarkdownFromOutlineTree(default_outline_tree))
const current_article_meta_data = ref({ ...default_artical_meta_data })//拷贝了默认值，避免引用问题
//监听current_article_meta_data.value的变化，如果有变化，则发送is-need-save事件
import { watch } from 'vue'
watch(
  current_article_meta_data,
  (newVal, oldVal) => {
    //console.log('current_article_meta_data changed', newVal, oldVal)
    eventBus.emit('is-need-save', true)
  },
  { deep: true }
)
var latest_view=ref('outline')
var renderedHtml = ref('')





import { reactive } from 'vue';
import { da } from 'element-plus/es/locales.mjs'

var current_ai_dialogs = ref([])


export const addDialog = (dialog,add2front=false) => {
  if(add2front) current_ai_dialogs.value.unshift(dialog);//添加到最前面
  else current_ai_dialogs.value.push(dialog);
  broadcastAiDialogs()
};

export const updateDialog = (index, newData) => {
  if (index >= 0 && index < current_ai_dialogs.value.length) {
    current_ai_dialogs.value[index] = { ...current_ai_dialogs.value[index], ...newData };
    broadcastAiDialogs()
  }
  //console.log(current_ai_dialogs)
  
};

export const deleteDialog = (index) => {
  if (index >= 0 && index < current_ai_dialogs.value.length) {
    current_ai_dialogs.value.splice(index, 1);
    broadcastAiDialogs()
  }
  
};
export {
  current_file_path,
  current_outline_tree,
  current_article,
  current_article_meta_data,
  default_outline_tree,
  default_artical_meta_data,
  latest_view,
  renderedHtml,

  current_ai_dialogs,

}
//因为ai助手属于不同的渲染进程，因此另一个进程需要先告诉主进程，主进程再广播给所有的渲染进程
import { toRaw } from 'vue';
import { decodeBase64ToJson, encodeJsonToBase64 } from './base64-utils'
export function broadcastAiDialogs() {
  //console.log(JSON.parse(JSON.stringify(current_ai_dialogs.value)))
  eventBus.emit('is-need-save',true)
  eventBus.emit('send-broadcast', {
    to: 'home',
    eventName: 'sync-ai-dialogs',
    data: JSON.parse(JSON.stringify(current_ai_dialogs.value))
  });

}


export function dump2json(mdreplace='') {

  return JSON.stringify({
    //current_file_path: current_file_path.value,
    current_outline_tree: current_outline_tree.value,
    current_article: mdreplace===''?current_article.value:mdreplace,
    current_article_meta_data: current_article_meta_data.value,
    current_ai_dialogs: current_ai_dialogs.value
  })
}
export function autoGenerateTitle(){
  //如果没有标题就尝试从文章内容中自动生成标题
  if(current_article_meta_data.value.title==='') {
    //从文章内容中提取第一个标题（一级、二级、三级等标题都可以）
    const firstTitleMatch = current_article.value.match(/^(#+)\s+(.*)$/m);
    if (firstTitleMatch) {
      const title = firstTitleMatch[2].trim();
      current_article_meta_data.value.title = title;
    }
    else{
      //否则尝试截取文章内容的前50个字符（如果文章内容少于50个字符，则截取全部）
      const content = current_article.value.trim().substring(0, 50);
      current_article_meta_data.value.title = content.length > 0 ? content : '无标题文档';
    }
  }

}

export function load_from_json(json) {
  var data = JSON.parse(json)
  //current_file_path.value = data.current_file_path
  current_outline_tree.value = JSON.parse(JSON.stringify(data.current_outline_tree))
  //console.log(current_outline_tree)
  current_article.value = data.current_article
  //console.log(current_article)
  current_article_meta_data.value={...data.current_article_meta_data}
  current_ai_dialogs.value=data.current_ai_dialogs
  autoGenerateTitle();
}

export function dump2md(mdreplace='') {
  //我们要把一些元数据也放到md中去，通过注释的方式来存储，为了防止json里面的转义字符和换行符，我们把元信息的json字符串进行base64编码
  const pure_md= mdreplace===''?current_article.value:mdreplace;//不包含元信息的md内容
  const metaData = {
    current_outline_tree: current_outline_tree.value,
    current_article_meta_data: current_article_meta_data.value,
    current_ai_dialogs: current_ai_dialogs.value
  }
  const metaDataBase64 = encodeJsonToBase64(metaData);
  //在md的结尾插入元信息
  //console.log(metaDataBase64)
  return pure_md + '\n<!--meta-info: ' + metaDataBase64 + ' -->';
}
export function load_from_md(md) {
  //读取的时候先用正则表达式提取元信息
  const metaInfoMatch = md.match(/<!--meta-info:\s*([^-\s]+?)\s*-->/);
  const pureMd = md.replace(/<!--meta-info:\s*[^-]+?\s*-->/, '').trim();
  current_article.value = pureMd;
  //console.log(metaInfoMatch)
  if (metaInfoMatch && metaInfoMatch[1]) {
    const metaDataBase64 = metaInfoMatch[1];
    const metaData = decodeBase64ToJson(metaDataBase64);
    //console.log(metaData)
    current_outline_tree.value = JSON.parse(JSON.stringify(metaData.current_outline_tree))
    current_article_meta_data.value = { ...metaData.current_article_meta_data }
    current_ai_dialogs.value=metaData.current_ai_dialogs
  } else {
    //如果没有元信息，则创建元信息
    current_outline_tree.value = extractOutlineTreeFromMarkdown(pureMd);
    current_article_meta_data.value = { ...default_artical_meta_data }
    current_ai_dialogs.value=[]
  }
  autoGenerateTitle();
  //console.log(current_article_meta_data.value)
  //把md内容中的元信息部分去掉
  
}

export function sync() {
  if(latest_view.value==='outline') {
    current_article.value=generateMarkdownFromOutlineTree(current_outline_tree.value)
    latest_view.value='article';
    //eventBus.emit('refresh')
  }
  else if(latest_view.value==='article') {
    //console.log(current_article.value)
    current_outline_tree.value=extractOutlineTreeFromMarkdown(current_article.value)
    latest_view.value='outline';
  }
  //eventBus.emit('is-need-save',true)
  

}
export async function init() {
  //console.log("init");
  current_file_path.value = ''
  current_outline_tree.value = JSON.parse(JSON.stringify(default_outline_tree)) //深拷贝
  current_article.value = generateMarkdownFromOutlineTree(current_outline_tree.value)
  current_article_meta_data.value = { ...default_artical_meta_data } //拷贝默认值，避免引用问题
  current_ai_dialogs.value = []
  eventBus.emit('refresh')
  eventBus.emit('reset-quickstart')
}

export function searchNode(path, node) {

  if (node.path === path) {
    return node
  }
  if (node.children) {
    for (let child of node.children) {
      const result = searchNode(path, child)
      if (result) {
        return result
      }
    }
  }
  return null
}
export function searchParentNode(path, node) {
  if (node.children) {
    for (let child of node.children) {
      if (child.path === path) {
        return node
      }
      const result = searchParentNode(path, child)
      if (result) {
        return result
      }
    }
  }
  return null
}

export function countNodes(node) {
  let count = 1
  if (node.children) {
    for (let child of node.children) {
      count += countNodes(child)
    }
  }
  return count
}