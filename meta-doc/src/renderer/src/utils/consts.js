
const local= 'http://localhost:8080';//本地服务器地址
const aliyun= 'https://101.37.254.247:8080';//阿里云服务器地址

export const SERVER_URL = 'http://localhost:8080';//Spring Boot后端服务器的地址，实际使用时需要替换为实际的服务器地址

export const  outline_tree_example = {
  path: 'dummy',//编号规则：根节点无编号，为dummy，第一级标题编号为1，第二级标题编号为1.1，第三级标题编号为1.1.1，以此类推
  title: '',//当前节点的标题
  text: '',//当前节点的文本内容
  title_level: 0,//当前节点标题的层级，一级标题为1,二级为2，一般来说是上一层+1，但是可能不止+1，例如从一级跳到三级
  children: [//子节点列表，子节点结构和当前相同
    {
    path: '1',
    title: '新文档',
    text: '',
    title_level: 1,
    children: [
      { title: '引言', path: '1.1',text:'', children: [] ,title_level: 2,},
      { title: '第一章：概述', path: '1.2',text:'', children: [] ,title_level: 2},
      {
        title: '第二章：实现',
        path: '1.3',
        text:'',
        title_level: 2,
        children: [
          { title: '2.1 实现细节', path: '1.3.1',text:'', children: [] ,title_level: 3},
          { title: '2.2 实现步骤', path: '1.3.2',text:'', children: [] ,title_level: 3}
        ]
      }
    ]
  }]
}