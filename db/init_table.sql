CREATE TABLE `user` (
	id INT AUTO_INCREMENT PRIMARY KEY,-- 唯一的用户id
	username VARCHAR ( 100 ) NOT NULL,-- 用户名
	`password` VARCHAR ( 255 ) NOT NULL,-- 加密后的密码，只能单向加密
	email VARCHAR ( 100 ),-- 邮箱
	phone VARCHAR ( 100 ),-- 手机号
	avatar_id INT NULL,-- 与图片ID对应的头像
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	tokens DECIMAL,-- 用来记录用户有多少tokens
	setting MEDIUMTEXT -- 用户配置设置的json
	
);-- 用户信息表
CREATE TABLE `image` (
	id INT AUTO_INCREMENT PRIMARY KEY,-- 图片id
	`hash` VARCHAR ( 100 ) NOT NULL,-- 图片的哈希值
	b64_string LONGTEXT NOT NULL,-- base64字符串
	creator_uid INT,-- 图片由谁创建
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,-- 创建时间
	FOREIGN KEY ( creator_uid ) REFERENCES `user` ( id ) 
);-- 图片信息表
CREATE TABLE tokenlog (
	id INT AUTO_INCREMENT PRIMARY KEY,
	uid INT NOT NULL,-- 对应的uid,
	delta_value INT NOT NULL,-- 变化量
	prev_log_id INT,-- 上一条该用户token记录的logid，如果是第一条那就是空
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	msg VARCHAR ( 100 ),-- 变化描述概要
	info LONGTEXT,-- 详细信息的json字符串
	FOREIGN KEY ( uid ) REFERENCES `user` ( id ) 
);-- 记录token变化
CREATE TABLE document (
	id INT AUTO_INCREMENT PRIMARY KEY,
	uid INT NOT NULL,-- 拥有者的ID
	json LONGTEXT,-- 文档的整个json信息
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
FOREIGN KEY ( uid ) REFERENCES `user` ( id ) 
);-- 文档信息表