import {ref} from 'vue';
import eventBus from '../utils/event-bus';
const default_outline_tree={
    path: '',
    value: '文档大纲',
    children: [
      { value: '引言', path: '1', children: [] },
      { value: '第一章：概述', path: '2', children: [] },
      {
        value: '第二章：实现', path: '3',
        children: [
          { value: '2.1 实现细节', path: '3.1', children: [] },
          { value: '2.2 实现步骤', path: '3.2', children: [] }
        ]
      }
    ]
  };

const default_artical_meta_data={
    title:"",
    author:"",
    description:"",
    
};

var current_file_path=ref("");
var current_outline_tree=ref(JSON.parse(JSON.stringify(default_outline_tree)));
var current_article=ref("");
var current_article_meta_data=ref(default_artical_meta_data);
export { current_file_path, current_outline_tree, current_article, current_article_meta_data,default_outline_tree,default_artical_meta_data };

export function dump2json(){
    return JSON.stringify(
      {
      current_file_path : current_file_path.value,
      current_outline_tree : current_outline_tree.value,
      current_article : current_article.value,
      current_article_meta_data : current_article_meta_data.value
    }
  );
}

export function load_from_json(json){
    var data=JSON.parse(json);
    current_file_path=data.current_file_path;
    current_outline_tree=data.current_outline_tree;
    current_article=data.current_article;
    current_article_meta_data=data.current_article_meta_data;
}

export function init(){
    //console.log("init");
    current_file_path.value="";
    current_outline_tree.value=JSON.parse(JSON.stringify(default_outline_tree));//深拷贝
    current_article.value="";
    current_article_meta_data.value=JSON.parse(JSON.stringify(default_artical_meta_data));

}
