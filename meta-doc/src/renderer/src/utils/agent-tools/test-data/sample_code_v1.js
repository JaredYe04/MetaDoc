// 用户管理模块
class UserManager {
  constructor() {
    this.users = [];
    this.currentUser = null;
  }

  // 添加用户
  addUser(user) {
    if (!user || !user.name) {
      throw new Error('用户信息不完整');
    }
    this.users.push(user);
    return user;
  }

  // 查找用户
  findUser(id) {
    return this.users.find(user => user.id === id);
  }

  // 更新用户信息
  updateUser(id, updates) {
    const user = this.findUser(id);
    if (!user) {
      throw new Error('用户不存在');
    }
    Object.assign(user, updates);
    return user;
  }

  // 删除用户
  deleteUser(id) {
    const index = this.users.findIndex(user => user.id === id);
    if (index === -1) {
      throw new Error('用户不存在');
    }
    return this.users.splice(index, 1)[0];
  }

  // 获取所有用户
  getAllUsers() {
    return this.users;
  }

  // 设置当前用户
  setCurrentUser(user) {
    this.currentUser = user;
  }

  // 获取当前用户
  getCurrentUser() {
    return this.currentUser;
  }
}

// 导出模块
module.exports = UserManager;

