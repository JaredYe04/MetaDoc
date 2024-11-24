//这个文件需要实现一系列Markdown相关的功能函数

import eventBus from "./event-bus"


// 1. 从Markdown文本中提取所有标题，生成大纲树

export function extractOutlineTreeFromMarkdown(md,bypassText=false) {
    //console.log(md);
    const lines = md.split('\n')
    //console.log(lines);
    const outline_tree = {
        title:'',//当前标题
        path:'dummy', //当前标题的路径,编号规则：根节点无编号，第一级标题编号为1，第二级标题编号为1.1，第三级标题编号为1.1.1，以此类推
        text:'',//当前标题的内容，不包括子标题以及内容
        children: []
    }

    let current_node = outline_tree
    let stack = [outline_tree]
    for(let i = 0; i < lines.length; i++) {
        const line = lines[i]
        //console.log(line);
        const match = line.match(/^#+\s+(.*)/)
        //console.log(match);
        if(match) {
            const title = match[1]
            //console.log(title);
            const level = match[0].match(/#/g).length
            //console.log(level);
            const new_node = {
                title: title,
                path: '',
                text: '',
                children: []
            }
            //console.log(new_node);
            if(level > stack.length) {
                stack[stack.length - 1].children.push(new_node)
                stack.push(new_node)
            } else {
                stack[level - 1].children.push(new_node)
                stack[level] = new_node
            }
            current_node = new_node
        } else {
            if(!bypassText){
                current_node.text += line + '\n'
            }
        }
    }
    //console.log(outline_tree);
    //根据大纲树生成路径
    let path = ''
    let path_stack = []
    let path_index = 1
    let root = outline_tree
    //root节点通常是dummy,path为dummy,不需要编号，而它的子节点按照顺序依次为1,2,3,4...，子节点的子节点按照1.1,1.2,1.3,1.4...编号
    for(let i = 0; i < root.children.length; i++) {
        root.children[i].path = path + (i + 1)
        path_stack.push(root.children[i])
    }
    while(path_stack.length > 0) {
        let node = path_stack.pop()
        path = node.path + '.'
        for(let i = 0; i < node.children.length; i++) {
            node.children[i].path = path + (i + 1)
            path_stack.push(node.children[i])
        }
    }
    
    //console.log(outline_tree);
    return outline_tree//最外层节点是dummy节点
}


// 2. 从大纲树生成Markdown文本

export function generateMarkdownFromOutlineTree(outline_tree) {
    console.log(outline_tree);
    let md = ''
    function dfs(node, level) {
        md += '#'.repeat(level) + ' ' + node.title + '\n'
        // if(node.text.trim()==''){//如果node.text不是空，那么加一个换行符
        //     node.text+='\n'
        // }
        md += node.text;
        //如果node.text最后一个字符不是换行符，那么加一个换行符
        // if(!node.text || node.text.trim()==''){
        //     node.text='\r\n'
        // }
        if(node.text[node.text.length-1]!=='\n'){
            md+='\n'
        }
        for(let i = 0; i < node.children.length; i++) {
            dfs(node.children[i], level + 1)
        }
    }
    if(outline_tree.path==='dummy'){//如果是根节点
        for(let i=0;i<outline_tree.children.length;i++){
            dfs(outline_tree.children[i],1)
        }
    }
    console.log(md);
    return md
}
