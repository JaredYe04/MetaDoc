// 用户管理模块
class UserManager {
  constructor() {
    this.users = [];
    this.currentUser = null;
    this.userCount = 0;
  }

  // 添加用户
  addUser(user) {
    if (!user || !user.name || !user.email) {
      throw new Error('用户信息不完整，需要提供姓名和邮箱');
    }
    user.id = ++this.userCount;
    user.createdAt = new Date();
    this.users.push(user);
    return user;
  }

  // 查找用户
  findUser(id) {
    return this.users.find(user => user.id === id);
  }

  // 根据邮箱查找用户
  findUserByEmail(email) {
    return this.users.find(user => user.email === email);
  }

  // 更新用户信息
  updateUser(id, updates) {
    const user = this.findUser(id);
    if (!user) {
      throw new Error('用户不存在');
    }
    user.updatedAt = new Date();
    Object.assign(user, updates);
    return user;
  }

  // 删除用户
  deleteUser(id) {
    const index = this.users.findIndex(user => user.id === id);
    if (index === -1) {
      throw new Error('用户不存在');
    }
    const deletedUser = this.users.splice(index, 1)[0];
    if (this.currentUser && this.currentUser.id === id) {
      this.currentUser = null;
    }
    return deletedUser;
  }

  // 获取所有用户
  getAllUsers() {
    return [...this.users]; // 返回副本，避免直接修改原数组
  }

  // 设置当前用户
  setCurrentUser(user) {
    if (user && !this.findUser(user.id)) {
      throw new Error('用户不存在于用户列表中');
    }
    this.currentUser = user;
  }

  // 获取当前用户
  getCurrentUser() {
    return this.currentUser;
  }

  // 获取用户数量
  getUserCount() {
    return this.users.length;
  }
}

// 导出模块
export default UserManager;

