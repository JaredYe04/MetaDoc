// 从环境变量读取服务器地址，如果没有配置则使用默认值
// 优先使用 VITE_SERVER_URL（Vite 环境变量），如果没有则使用默认值
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:8080' //Spring Boot后端服务器的地址，从环境变量读取

export const outline_tree_example = {
  path: 'dummy', //编号规则：根节点无编号，为dummy，第一级标题编号为1，第二级标题编号为1.1，第三级标题编号为1.1.1，以此类推
  title: '', //当前节点的标题
  text: '', //当前节点的文本内容
  title_level: 0, //当前节点标题的层级，一级标题为1,二级为2，一般来说是上一层+1，但是可能不止+1，例如从一级跳到三级
  children: [
    //子节点列表，子节点结构和当前相同
    {
      path: '1',
      title: '',
      text: '',
      title_level: 1,
      children: [
        { title: '引言', path: '1.1', text: '', children: [], title_level: 2 },
        { title: '第一章：概述', path: '1.2', text: '', children: [], title_level: 2 },
        {
          title: '第二章：实现',
          path: '1.3',
          text: '',
          title_level: 2,
          children: [
            { title: '2.1 实现细节', path: '1.3.1', text: '', children: [], title_level: 3 },
            { title: '2.2 实现步骤', path: '1.3.2', text: '', children: [], title_level: 3 }
          ]
        }
      ]
    }
  ]
}

export const ai_task_status = {
  READY: '就绪',
  RUNNING: '运行中',
  FINISHED: '已完成',
  FAILED: '失败',
  CANCELLED: '取消'
}
