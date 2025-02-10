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
  const editor = document.querySelector('.vditor-ir');
  if (!editor) return;
  const content = editor.innerText;
  const regex = useRegex.value ? new RegExp(form.value.find, 'g') : null;
  const newContent = content.replace(regex || form.value.find, form.value.replace);
  editor.innerText = newContent;
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
  eventBus.emit('show-success', `共把${count}处"${form.value.find}"匹配替换为"${form.value.replace}"`);
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
  clearSelection();
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
    const findAndHighlight = (element,startOffset=0) => {
      if (flag) return;//找到匹配的文本，后续不再查找
      if (element.nodeType === Node.TEXT_NODE) {
        //要加上startOffset，因为可能是从中间开始查找
        const original_text = element.textContent;
        const text = element.textContent.substring(startOffset);
        const match = text.match(regex);
        if (!match) return;
        const index = text.indexOf(match[0])+startOffset;//找到匹配的文本的位置
        if (index !== -1) {
          flag = true;//找到匹配的文本，后续不再查找
          //注意，标黄仅对文本本身进行标黄，不会对文本节点的父元素进行标黄
          const before = document.createTextNode(original_text.substring(0, index));
          const after = document.createTextNode(original_text.substring(index + match[0].length));
          //使用一个span元素包裹匹配的文本，然后替换原来的文本节点，并且class叫做highlight,这样就可以通过css来设置高亮的样式
          const newElement = document.createElement('span');
          newElement.style.backgroundColor = 'yellow';
          newElement.class = 'highlight';
          newElement.innerText = match[0];
          newElement.style.color = 'black';
          //console.log(newElement);
          element.replaceWith(before, newElement, after);
          //文字聚焦到匹配的文本之后
          newElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

        }
      } else {
        element.childNodes.forEach(findAndHighlight);
      }
    };
    //查找的范围，从当前的光标位置开始查找，位置要精确到最小的文本节点
    const selection = window.getSelection();
    const startContainer = selection.anchorNode;
    const startOffset = selection.anchorOffset;
    console.log(startContainer);
    findAndHighlight(startContainer,startOffset);
    if (!flag) {
      //如果没有找到，从头开始查找
      editor.childNodes.forEach(findAndHighlight);
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