<template>

  <div class="search-replace-menu aero-div" :style="menuStyles" @mousedown.stop="onMouseDown">
    <div style="width: 100% ;height: fit-content; align-items: end; ">
      <el-button circle size="small" type="danger" @click="clearSelection(); $emit('close')" class="aero-btn"
        style="float: inline-start; margin-right: 20px;" @mousedown.stop>
      </el-button>
      <p style="left: 20px;">查找与替换</p>
    </div>
    <el-form :model="form" @mousedown.stop>
      <el-form-item label="查找">
        <el-input v-model="form.find" type="textarea" placeholder="请输入查找内容" />
      </el-form-item>
      <el-form-item label="替换">
        <el-input v-model="form.replace" type="textarea" placeholder="请输入替换内容" />
      </el-form-item>
      <el-form-item>
        <el-checkbox v-model="useRegex">使用正则表达式</el-checkbox>
      </el-form-item>
      <el-form-item>
        <el-button @click="replace" :disabled="form.find.length === 0">替换</el-button>
        <el-button @click="replaceAll" :disabled="form.find.length === 0">全部替换</el-button>
        <el-button @click="findNext" :disabled="form.find.length === 0">查找下一处</el-button>
        <el-button @click="findAll" :disabled="form.find.length === 0">查找全部</el-button>
        <el-button @click="clearSelection">重置</el-button>
      </el-form-item>
    </el-form>
    <div v-if="aiResponse" class="ai-response">
      <p>AI建议的正则表达式：</p>
      <el-input v-model="aiResponse" readonly />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { ElForm, ElFormItem, ElInput, ElButton, ElCheckbox } from 'element-plus';
import { themeState } from '../utils/themes';
import eventBus from '../utils/event-bus';
import Vditor from 'vditor';
import { af } from 'element-plus/es/locales.mjs';
const emit = defineEmits(['close']);
const props = defineProps({
  position: {
    type: Object,
    required: true,
  },
})

const form = ref({ find: '', replace: '' });
const useRegex = ref(false);
const aiResponse = ref('');
const menuPosition = ref({ top: props.position.top, left: props.position.left });
const isDragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });

const menuStyles = computed(() => ({
  position: 'absolute',
  top: `${menuPosition.value.top}px`,
  left: `${menuPosition.value.left}px`,
  border: '1px solid #ccc',
  borderColor: themeState.currentTheme.textColor,
  padding: '10px',
  boxShadow: '0px 2px 10px rgba(0, 0, 0, 0.2)',
  width: '600px',
  maxWidth: '600px',
  zIndex: 1000,
  backdropFilter: 'blur(5px)',
  backgroundColor: themeState.currentTheme.background2nd,
  opacity: 0.95,
}));

const onMouseDown = (event) => {
  isDragging.value = true;
  dragStart.value = {
    x: event.clientX - menuPosition.value.left,
    y: event.clientY - menuPosition.value.top,
  };
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
};

const onMouseMove = (event) => {
  if (!isDragging.value) return;
  menuPosition.value = {
    top: event.clientY - dragStart.value.y,
    left: event.clientX - dragStart.value.x,
  };
};

const onMouseUp = () => {
  isDragging.value = false;
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
};
const replace = () => {
  let highlight = document.getElementById('cur_highlight');
  //如果没有highlight的元素，就先findNext，然后再替换
  if(!highlight || highlight.innerText !== form.value.find ||  highlight.innerText === form.value.replace){
    findNext();
    highlight = document.getElementById('cur_highlight');
    if(!highlight){
      return;
    }
  }
  //如果有highlight的元素，直接替换highlight的元素的innerText
  //highlight.innerText = form.value.replace;
  //要把highlight替换成新的文本节点
  const text = document.createTextNode(form.value.replace);
  highlight.replaceWith(text);
  clearSelection();
  eventBus.emit('vditor-sync-with-html');//同步html到vditor
  findNext();
};

const replaceAll = () => {
  clearSelection();
  const editor = document.querySelector('.vditor-ir');
  if (!editor) return;
  //console.log(editor);
  const content = editor.innerHTML;//因为editor是一个div，里面有很多子元素，所以这里使用innerHTML获取所有内容
  let regex = useRegex.value ? new RegExp(form.value.find, 'g') : null;
  //如果不是正则表达式，则把文本转义为正则表达式
  if (!regex) {
    const new_reg = form.value.find.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    regex = new RegExp(new_reg, 'g');
  }
  //匹配所有的文本，如果出现多次都要高亮显示
  let count = 0;
  const findAndHighlight = (element) => {
    if (element.nodeType === Node.TEXT_NODE) {
      //使用正则表达式，找到匹配文本,
      let current_element = element;
      //对current_element的第一个进行高亮，然后把after设为current_element的第一个，然后继续循环
      while (current_element) {
        const text = current_element.textContent;
        const match = text.match(regex);
        if (match) {
          count++;
          const index = text.indexOf(match[0]);
          //注意，标黄仅对文本本身进行标黄，不会对文本节点的父元素进行标黄
          const before = document.createTextNode(text.substring(0, index));
          const after = document.createTextNode(text.substring(index + match[0].length));
          //使用一个span元素包裹匹配的文本，然后替换原来的文本节点，并且class叫做highlight,这样就可以通过css来设置高亮的样式
          const newElement = document.createElement('span');
          //newElement.style.backgroundColor = 'yellow';
          //newElement.class = 'highlight';
          newElement.innerText = form.value.replace;
          //newElement.style.color = 'black';
          //console.log(newElement);
          current_element.replaceWith(before, newElement, after);
          //文字聚焦到匹配的文本之后
          //newElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          current_element = after;
        } else {
          //console.log(current_element);
          current_element = null;
        }
      }

    } else {
      element.childNodes.forEach(findAndHighlight);
    }
  };
  editor.childNodes.forEach(findAndHighlight);

  clearSelection();
  eventBus.emit('vditor-sync-with-html');//同步html到vditor
  eventBus.emit('show-success', `共把${count}处"${form.value.find}"匹配替换为"${form.value.replace}"`);
};
const mergeTextNodes = (element) => {
  if (element.nodeType === Node.TEXT_NODE) {
    let current_element = element;
    while (current_element.nextSibling && current_element.nextSibling.nodeType === Node.TEXT_NODE) {
      current_element.textContent += current_element.nextSibling.textContent;
      current_element.parentNode.removeChild(current_element.nextSibling);
    }
  } else {
    element.childNodes.forEach(mergeTextNodes);
  }
};
const clearSelection = () => {
  //把所有的class叫做highlight的元素的class清除掉，替换为里面的innerText
  const editor = document.querySelector('.vditor-ir');
  //递归删除所有的高亮显示，如果子节点含有highlight类，就替换为文本节点
  const clearHighlight = (element) => {
    if (element.class === 'highlight') {
      const text = document.createTextNode(element.innerText);
      //console.log(text);
      //把整个span标签，替换为文本本身，而不是替换为文本节点的内容
      element.replaceWith(text);
    } else {
      element.childNodes.forEach(clearHighlight);
    }
  };
  editor.childNodes.forEach(clearHighlight);
  //为了保持文本的连贯性，把所有相邻的文本节点合并为一个文本节点

  editor.childNodes.forEach(mergeTextNodes);
};//清除所有高亮显示

const findAll = () => {
  clearSelection();
  const editor = document.querySelector('.vditor-ir');
  if (!editor) return;
  //console.log(editor);
  const content = editor.innerHTML;//因为editor是一个div，里面有很多子元素，所以这里使用innerHTML获取所有内容
  let regex = useRegex.value ? new RegExp(form.value.find, 'g') : null;
  //如果不是正则表达式，则把文本转义为正则表达式
  if (!regex) {
    const new_reg = form.value.find.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    regex = new RegExp(new_reg, 'g');
  }
  //匹配所有的文本，如果出现多次都要高亮显示
  let count = 0;
  const findAndHighlight = (element) => {
    if (element.nodeType === Node.TEXT_NODE) {
      //使用正则表达式，找到匹配文本,
      let current_element = element;
      //对current_element的第一个进行高亮，然后把after设为current_element的第一个，然后继续循环
      while (current_element) {
        const text = current_element.textContent;
        const match = text.match(regex);
        if (match) {
          count++;
          const index = text.indexOf(match[0]);
          //注意，标黄仅对文本本身进行标黄，不会对文本节点的父元素进行标黄
          const before = document.createTextNode(text.substring(0, index));
          const after = document.createTextNode(text.substring(index + match[0].length));
          //使用一个span元素包裹匹配的文本，然后替换原来的文本节点，并且class叫做highlight,这样就可以通过css来设置高亮的样式
          const newElement = document.createElement('span');
          newElement.style.backgroundColor = 'yellow';
          newElement.class = 'highlight';
          newElement.setAttribute('class', 'highlight');
          newElement.innerText = match[0];
          newElement.style.color = 'black';
          //console.log(newElement);
          current_element.replaceWith(before, newElement, after);
          //文字聚焦到匹配的文本之后
          //newElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          current_element = after;
        } else {
          //console.log(current_element);
          current_element = null;
        }
      }

    } else {
      element.childNodes.forEach(findAndHighlight);
    }
  };
  editor.childNodes.forEach(findAndHighlight);
  eventBus.emit('show-info', `"${form.value.find}"共找到${count}处匹配`);
}
const findNext = () => {
  
  const editor = document.querySelector('.vditor-ir');
  if (!editor) return;
  //console.log(editor);

  let regex = useRegex.value ? new RegExp(form.value.find, 'g') : null;
  //如果不是正则表达式，则把文本转义为正则表达式
  if (!regex) {
    const new_reg = form.value.find.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    regex = new RegExp(new_reg, 'g');
  }
  if (true) {
    //递归地查找editor的子元素，找到匹配的文本，然后高亮显示
    let flag = false;//标记是否找到匹配的文本
    //首先检查一下是否有highlight的元素，如果有，就从highlight的元素之后开始查找
    //如果没有，就从头开始查找
    //如果highlight的元素，和regex不匹配，就执行clearSelection
    //注意，是attribute里面的class，而不是property里面的class
    let highlights = document.getElementsByClassName('highlight');
    if (highlights.length > 1) {
      //console.log('hello')
      clearSelection();
    }
    {
      //console.log(highlights)
      let match = null;
      //选中id为cur_highlight的元素
      const highlight = document.getElementById('cur_highlight');
      //首先判断一下highlight的元素是否和regex匹配
      if (highlight) {
        match = highlight.innerText.match(regex);
      }
      //console.log(match);
      //如果不匹配，就执行clearSelection
      //查询的范围，应当是highlight的元素之后的所有文本。如果没有highlight的元素，就是整个editor的文本

      // console.log( highlight);
      if (!match) {
        clearSelection();
      }
      //查找下一个匹配的文本，打上highlight的标签
      let flag = false;
      const findAndHighlight = (element) => {
        if (flag) {
          return;
        }
        if (element.nodeType === Node.TEXT_NODE) {
          //使用正则表达式，找到匹配文本,
          let current_element = element;
          //对current_element的第一个进行高亮，然后把after设为current_element的第一个，然后继续循环
          while (current_element) {
            if (flag) {
              return;
            }
            const text = current_element.textContent;
            const match = text.match(regex);
            if (match) {
              let is_after = false;
              if (!highlight) {
                is_after = true;
              }
              else {

                let temp = highlight.nextSibling;
                while (temp && !is_after) {
                  if (temp === current_element) {
                    is_after = true;
                    break;
                  }
                  if (!temp.nextSibling) {
                    //选择下一段落，也就是父节点的下一个节点
                    temp = temp.parentNode;
                    //console.log(temp);
                  }
                  else {
                    temp = temp.nextSibling;
                  }
                }//本段搜索

                if (!is_after) {//如果这段没有找到，就搜索父节点的所有兄弟节点

                  temp = highlight.parentNode;
                  //console.log(temp);
                  let parent_siblings = [];//存放highlight的父节点的所有兄弟节点
                  while (temp.nextSibling) {
                    parent_siblings.push(temp.nextSibling);
                    temp = temp.nextSibling;
                  }
                  //console.log(parent_siblings);
                  for (let i = 0; i < parent_siblings.length; i++) {
                    temp = parent_siblings[i].childNodes[0];
                    while (temp && !is_after) {
                      if (temp === current_element) {
                        is_after = true;
                        break;
                      }
                      if (!temp.nextSibling) {
                        //选择下一段落，也就是父节点的下一个节点
                        temp = temp.parentNode;
                        //console.log(temp);
                      }
                      else {
                        temp = temp.nextSibling;
                      }

                    }//父节点搜索
                  }

                }
              }
              const index = text.indexOf(match[0]);
              //注意，标黄仅对文本本身进行标黄，不会对文本节点的父元素进行标黄
              const before = document.createTextNode(text.substring(0, index));
              const after = document.createTextNode(text.substring(index + match[0].length));
              if (is_after) {//只有在上一个highlight之后的节点才会被highlight

                //如果找到了匹配的文本，需要把原先的highlight的元素清除掉
                //使用replaceWith方法，替换highlight的元素
                //console.log(current_element);
                if (highlight) {
                  const text = document.createTextNode(highlight.innerText);
                  highlight.replaceWith(text);
                  //使用mergeTextNodes，把所有相邻的文本节点合并为一个文本节点
                  mergeTextNodes(highlight);//todo
                }

                flag = true;
                //使用一个span元素包裹匹配的文本，然后替换原来的文本节点，并且class叫做highlight,这样就可以通过css来设置高亮的样式
                const newElement = document.createElement('span');
                newElement.style.backgroundColor = 'yellow';
                newElement.class = 'highlight';
                newElement.setAttribute('class', 'highlight');
                newElement.setAttribute('id', 'cur_highlight');
                newElement.innerText = match[0];
                newElement.style.color = 'black';
                //console.log(newElement);
                current_element.replaceWith(before, newElement, after);
                //文字聚焦到匹配的文本之后
                newElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }

              current_element = after;
            } else {
              //console.log(current_element);
              current_element = null;
            }
          }

        } else {
          element.childNodes.forEach(findAndHighlight);
        }
      };
      //findAndHighlight(editor);
      editor.childNodes.forEach(findAndHighlight);
      if (!flag) {
        clearSelection();
        eventBus.emit('show-info', `没有找到更多匹配`);
      }

    }

  }
};
const askAIForRegex = async () => {
  const response = await fetch('https://api.openai.com/v1/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer YOUR_OPENAI_API_KEY`,
    },
    body: JSON.stringify({
      model: 'text-davinci-003',
      prompt: `请为以下文本生成正则表达式：${form.value.find}`,
      max_tokens: 100,
    }),
  });
  const data = await response.json();
  aiResponse.value = data.choices[0].text.trim();
};
</script>

<style scoped>
.ai-response {
  margin-top: 10px;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
}
</style>