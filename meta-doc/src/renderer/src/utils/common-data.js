import { ref } from 'vue'
import eventBus from '../utils/event-bus'
import { generateMarkdownFromOutlineTree,extractOutlineTreeFromMarkdown } from './md-utils'
const default_outline_tree = {
  path: 'dummy',
  title: '',
  text: '',
  children: [{
    path: '1',
    title: '新文档',
    text: '',
    children: [
      { title: '引言', path: '1.1',text:'', children: [] },
      { title: '第一章：概述', path: '1.2',text:'', children: [] },
      {
        title: '第二章：实现',
        path: '1.3',
        text:'',
        children: [
          { title: '2.1 实现细节', path: '1.3.1',text:'', children: [] },
          { title: '2.2 实现步骤', path: '1.3.2',text:'', children: [] }
        ]
      }
    ]
  }]
}
//编号规则：根节点无编号，第一级标题编号为1，第二级标题编号为1.1，第三级标题编号为1.1.1，以此类推


export const firstLoad = ref(true)

const default_artical_meta_data = {
  title: '新文档',
  author: '',
  description: ''
}

var current_file_path = ref('')
var current_outline_tree = ref(JSON.parse(JSON.stringify(default_outline_tree)))
var current_article = ref(generateMarkdownFromOutlineTree(default_outline_tree))
var current_article_meta_data = ref(default_artical_meta_data)
var latest_view=ref('outline')
var renderedHtml = ref('')





import { reactive } from 'vue';
import { da } from 'element-plus/es/locales.mjs'

var current_ai_dialogs = ref([])

export const addDialog = (dialog) => {
  current_ai_dialogs.value.push(dialog);
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
export function broadcastAiDialogs() {
  //console.log(JSON.parse(JSON.stringify(current_ai_dialogs.value)))
  eventBus.emit('is-need-save',true)
  eventBus.emit('sync-ai-dialogs', JSON.parse(JSON.stringify(current_ai_dialogs.value)));
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

export function load_from_json(json) {
  var data = JSON.parse(json)
  //current_file_path.value = data.current_file_path
  current_outline_tree.value = JSON.parse(JSON.stringify(data.current_outline_tree))
  //console.log(current_outline_tree)
  current_article.value = data.current_article
  //console.log(current_article)
  current_article_meta_data.value = JSON.parse(JSON.stringify(data.current_article_meta_data))

  current_ai_dialogs.value=data.current_ai_dialogs
  //console.log(current_ai_dialogs.value)
  //console.log(current_article.value)
  //eventBus.emit('refresh')//加载完之后进行刷新
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
  current_article_meta_data.value = JSON.parse(JSON.stringify(default_artical_meta_data))
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