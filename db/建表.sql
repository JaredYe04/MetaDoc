-- 用户信息表
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(100) NOT NULL,
    profile_picture VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    subscription ENUM('free', 'premium', 'enterprise') DEFAULT 'free',
    status ENUM('active', 'inactive', 'suspended') DEFAULT 'active'
);

-- 文档信息表
CREATE TABLE documents (
    doc_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    title VARCHAR(255),
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    status ENUM('draft', 'published', 'archived') DEFAULT 'draft',
    is_shared BOOLEAN DEFAULT FALSE,
    is_synced BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 文档版本表
CREATE TABLE document_versions (
    version_id INT AUTO_INCREMENT PRIMARY KEY,
    doc_id INT,
    user_id INT,
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    change_description TEXT,
    FOREIGN KEY (doc_id) REFERENCES documents(doc_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 文档共享表
CREATE TABLE document_shares (
    share_id INT AUTO_INCREMENT PRIMARY KEY,
    doc_id INT,
    user_id INT,
    shared_with_user_id INT,
    permissions ENUM('view', 'edit') DEFAULT 'view',
    shared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (doc_id) REFERENCES documents(doc_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (shared_with_user_id) REFERENCES users(user_id)
);

-- 文档协作历史表
CREATE TABLE document_collaborations (
    collab_id INT AUTO_INCREMENT PRIMARY KEY,
    doc_id INT,
    user_id INT,
    action ENUM('create', 'edit', 'delete', 'comment'),
    action_description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (doc_id) REFERENCES documents(doc_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 会员信息表
CREATE TABLE subscriptions (
    subscription_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    plan_type ENUM('free', 'premium', 'enterprise') DEFAULT 'free',
    start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP,
    status ENUM('active', 'expired', 'cancelled') DEFAULT 'active',
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 文档同步表
CREATE TABLE document_syncs (
    sync_id INT AUTO_INCREMENT PRIMARY KEY,
    doc_id INT,
    sync_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    device VARCHAR(100),
    status ENUM('success', 'failed') DEFAULT 'success',
    FOREIGN KEY (doc_id) REFERENCES documents(doc_id)
);