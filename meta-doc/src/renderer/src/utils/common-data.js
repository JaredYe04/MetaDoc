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
export {
  current_file_path,
  current_outline_tree,
  current_article,
  current_article_meta_data,
  default_outline_tree,
  default_artical_meta_data,
  latest_view
}

export function dump2json() {
  return JSON.stringify({
    //current_file_path: current_file_path.value,
    current_outline_tree: current_outline_tree.value,
    current_article: current_article.value,
    current_article_meta_data: current_article_meta_data.value
  })
}

export function load_from_json(json) {
  var data = JSON.parse(json)
  //current_file_path.value = data.current_file_path
  current_outline_tree.value = data.current_outline_tree
  current_article.value = data.current_article
  current_article_meta_data.value = data.current_article_meta_data
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
  

}
export async function init() {
  //console.log("init");
  current_file_path.value = ''
  current_outline_tree.value = JSON.parse(JSON.stringify(default_outline_tree)) //深拷贝
  current_article.value = generateMarkdownFromOutlineTree(current_outline_tree.value)
  current_article_meta_data.value = JSON.parse(JSON.stringify(default_artical_meta_data))
  //eventBus.emit('refresh')
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