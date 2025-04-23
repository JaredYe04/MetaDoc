
export function generateTitlePrompt(treeJson) {
    return "你是一个文笔出色的编辑，以下是一篇文章大纲的树形json结构，请自动判断文章在讲什么，并生成一个标题注意不要有任何其他内容，只有标题，输出内容一定一定要在15字以内:" + treeJson;
}

export function generateDescriptionPrompt(treeJson) {
    return "你是一个文笔出色的编辑，以下是一篇文章大纲的树形json结构，请自动判断文章在讲什么，并生成一篇文章摘要,200字以内，注意不要有任何其他内容:" + treeJson;
}

export function sectionChangePrompt(tree, section, title, userPrompt, context_mode, article) {
    let prompt = "你是一个文笔出色的AI文本编辑助手，";
    //console.log(context_mode)
    switch (context_mode) {
        case 0:
            prompt += "现在用户有生成内容的需求，请根据用户的提示词进行文字编写。"+ "\"。当前需要处理的章节标题是：\"" + title + "\"，" +"用户提示词如下：\"" + userPrompt + "\"。";
            break;
        case 1:
            prompt += "现在用户有一篇文章，其中有一个章节需要你修改或生成。" +"以下是文章的大纲结构：\"" + tree
                + "\"。当前需要处理的章节标题是：\"" + title + "\"，" ;
            prompt += (section == ''
                    || !section
                    || section == NaN
                ) ? ('章节内容为空，需要你根据用户提示词来生成这一节。') :
                ("需要修改的原本章节内容是：\"" +
                    section + "\"，");
            prompt += "用户提示词如下：\"" + userPrompt + "\"。";
            break;
        case 2:
            prompt += "现在用户有一篇文章，其中有一个章节需要你修改或生成。" +
                "以下是原本的全部文章内容：\"" + article
                + "\"。当前需要处理的章节标题是：\"" + title + "\"，" ;
            prompt += 
                (section == ''
                    || !section
                    || section == NaN
                ) ? ('章节内容为空，需要你来生成这一节。') :
                ("需要修改的原本章节内容是：\"" +
                    section + "\"，");
            prompt += "用户提示词如下：\"" + userPrompt + "\"。";
            break;

    }
    // "现在用户有一篇文章，其中有一段需要你修改；；；" +
    //     "以下是文章的大纲结构：" + tree +
    //     "；；；当前章节标题是：\"" +
    //     title + "\"，" +
    //     (
    //         (section == '' 
    //             || !section
    //             || section==NaN
    //         ) ? ('章节内容为空，需要你来生成这一节') :
    //             ("需要修改的章节是：\"" +
    //                 section + "\"，")
    //             +
    //             +"以下是用户的需求：\"" +
    //             userPrompt + "\"，请根据用户需求修改或生成本节，注意不要有任何多余废话，只有修改后的章节内容。"
    //     );

    prompt+="请根据用户需求修改或生成本节，注意不要有任何多余废话，只有修改后的章节内容。";
    //console.log(prompt);
    return prompt;
}

export function outlineChangePrompt(fullTreeJson, nodeTreeJson, userPrompt) {
    const prompt = "你是一个文笔出色的编辑，现在有一个JSON类型的文章大纲树，全文大纲如下:\""
        + fullTreeJson + "\"，" +
        "当前章节是：\"" +
        nodeTreeJson + "\"，" +
        "以下是用户的需求：\"" +
        userPrompt + "\"，请根据用户需求，结合本章节在全文的上下文结构，尝试生成本章节的大纲（Markdown格式）一个标题占一行，如果有多层结构，使用分级标题" +
        +"，注意不要输出任何任何多余废话，输出结果只有本章节的子大纲，而不是全文大纲。";
    //console.log(prompt);
    return prompt;
}

export function generateArticlePrompt(mood, userPrompt) {
    const prompt = "你是一个文笔出色的编辑，现在用户需要你为他写一篇文章，以下是用户的需求：\"" +
        userPrompt + "\"，除此之外，你应当使用" + mood + "的情绪与口吻来撰写文章。请根据用户需求，以及情绪要求，输出文章。注意不要输出任何任何多余废话，只输出文章内容。";
    return prompt;
}

export function wholeArticleContextPrompt(content){
    const prompt = "你是一个文笔出色的编辑，现在我手上有一篇文档，内容如下：：：【文章开始】\"" +
        content+"\"【文章结束】；；；你需要理解文档意思，并根据我的提示词来进一步生成内容。";
    return prompt;
}


export const suggestionPresets = [
    { label: '菜谱', prompt: '帮我生成一份适合两人晚餐的菜谱，包含前菜、主菜和甜点' },
    { label: '旅行计划', prompt: '帮我制定一份为期三天的旅行计划，目的地是杭州，注重自然风光和文化景点' },
    { label: '健身计划', prompt: '帮我设计一份为期一个月的健身计划，目标是增肌，每周健身5次' },
    { label: '读书推荐', prompt: '推荐几本适合提高逻辑思维能力的书籍，并简要说明每本书的特点' },
    { label: '学习计划', prompt: '帮我制定一份学习计划，目标是在两个月内通过英语四级考试' },
    { label: '工作总结', prompt: '帮我写一篇本月的工作总结，重点突出团队合作和项目成果' },
    { label: '演讲稿', prompt: '帮我写一篇关于人工智能对未来社会影响的演讲稿，时长约5分钟' },
    { label: '购物清单', prompt: '帮我生成一份周末的家庭聚会购物清单，包含饮料、零食和主食材料' },
    { label: '时间管理', prompt: '帮我设计一个时间管理计划，每天分配学习、工作、锻炼和休闲的时间' },
    { label: '自我介绍', prompt: '帮我写一段简短的自我介绍，适用于技术交流会，重点突出编程经验和项目成果' },
    { label: '职业规划', prompt: '帮我设计一份未来五年的职业规划，目标是成为全栈工程师，涉及技能提升和项目经验' },
    { label: '健康饮食', prompt: '帮我设计一份健康饮食计划，目标是控制体重，每日摄入约1800卡路里' },
    { label: '生日祝福', prompt: '帮我写一条生日祝福语，适合给朋友发微信，幽默又温馨' },
    { label: '电影推荐', prompt: '推荐几部适合周末放松观看的电影，类型以轻松喜剧为主' },
    { label: '学习方法', prompt: '给我一些提高编程学习效率的建议，针对初学者' },
    { label: '产品描述', prompt: '帮我写一段产品描述，产品是一款多功能无线蓝牙耳机' },
    { label: '会议纪要', prompt: '帮我写一份会议纪要，会议讨论了项目进度和下阶段任务分配' },
    { label: '营销文案', prompt: '帮我写一段适用于社交媒体的产品营销文案，产品是一款健身应用' },
    { label: '邮件回复', prompt: '帮我写一封礼貌的邮件回复，感谢对方的合作并确认下次会议时间' },
    { label: '请假申请', prompt: '帮我写一封请假申请邮件，理由是家中有事需处理，时间为两天' },
    { label: '技术方案', prompt: '帮我撰写一份关于搭建企业内网的技术方案，包括硬件与软件需求' },
    { label: '用户反馈', prompt: '帮我写一段用户反馈，表扬一款手机应用的易用性和界面设计' },
    { label: '活动策划', prompt: '帮我策划一场企业年会活动，包含主题、节目安排和奖品设置' },
    { label: '宣传文案', prompt: '帮我写一段适用于微博的宣传文案，内容是关于新产品发布' },
    { label: '团建活动', prompt: '帮我设计一场团队建设活动，目标是增强团队协作能力' },
    { label: '新闻稿', prompt: '帮我写一篇公司新产品发布的新闻稿，强调创新功能和市场前景' },
    { label: '招聘启事', prompt: '帮我撰写一份招聘启事，职位是前端开发工程师，要求三年以上经验' },
    { label: '诗歌创作', prompt: '帮我写一首关于春天的诗歌，风格清新自然' },
    { label: '情感咨询', prompt: '给我一些处理恋爱中矛盾的建议，如何更好地沟通' },
    { label: '节日贺卡', prompt: '帮我写一段圣诞节贺卡的祝福语，适合发给朋友和同事' },
    { label: '活动邀请', prompt: '帮我写一封社交活动邀请函，活动是一次非正式的技术分享聚会' },
    { label: '产品对比', prompt: '帮我撰写一份产品对比分析，比较两款智能手机的功能和价格' },
    { label: '文案优化', prompt: '帮我优化一段产品介绍文案，使其更加吸引用户' },
    { label: '自媒体计划', prompt: '帮我设计一份自媒体运营计划，目标是增加粉丝量和互动率' },
    { label: '危机公关', prompt: '帮我撰写一份危机公关声明，针对产品缺陷导致的用户投诉' },
    { label: '博客文章', prompt: '帮我写一篇关于如何提高编程能力的博客文章，目标读者是初学者' },
    { label: '装修建议', prompt: '给我一些家居装修的建议，风格是现代简约' },
    { label: '生活建议', prompt: '帮我设计一份生活习惯改善计划，目标是早睡早起并增加锻炼' },
    { label: 'App建议', prompt: '给我一些关于改进一款待办事项应用的功能建议' },
    { label: '风险评估', prompt: '帮我撰写一份项目风险评估报告，涉及技术、资金和人员风险' },
    { label: '文化体验', prompt: '推荐几项可以在国外旅行时体验的当地文化活动' },
    { label: '演讲主题', prompt: '帮我设计一个适用于技术大会的演讲主题，方向是人工智能的未来' },
    { label: '写作灵感', prompt: '给我一些短篇小说的写作灵感，风格偏向科幻与悬疑' },
    { label: '团队激励', prompt: '帮我写一段团队激励的话，适用于项目进入关键阶段时' },
    { label: '学习资源', prompt: '推荐一些学习JavaScript的在线资源和视频课程' },
    { label: '母亲节祝福', prompt: '帮我写一段母亲节祝福，表达对母亲的感激之情' },
    { label: '新闻标题', prompt: '帮我起一个关于科技新品发布的新闻标题，简洁有力' },
    { label: '调查问卷', prompt: '帮我设计一份用户调查问卷，目标是了解用户对新功能的需求' }
];


export const explainWordPrompt = (word) => {
    return "请解释一下\"" + word + "\"这个词的意思。仅输出释义，不需要例句或其他内容。";
}  


export const generateGraphPrompt = (engine,type,prompt,special_prompt) => {
    return "你现在需要使用代码来画出一个图表，" +
        "你需要使用" + engine + "的图形语言，" +
        "图表类型是：" + type + "，" +
        "用户的提示词是：" + prompt + "，" +
        "请根据用户的提示词来生成图表，注意不要有任何多余废话，只有代码。代码要用代码框```xxx```包裹，并且代码框要包含图形语言的名称" +
        (special_prompt ? ("另外，需要注意：" + special_prompt) : "") +
        "；请确保代码的正确性和可读性。" ;
}