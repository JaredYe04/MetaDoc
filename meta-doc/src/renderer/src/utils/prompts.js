
export function generateTitlePrompt(treeJson) {
    return "你是一个文笔出色的编辑，以下是一篇文章大纲的树形json结构，请自动判断文章在讲什么，并生成一个标题注意不要有任何其他内容，只有标题，输出内容一定一定要在15字以内:" + treeJson;
}

export function generateDescriptionPrompt(treeJson) {
    return "你是一个文笔出色的编辑，以下是一篇文章大纲的树形json结构，请自动判断文章在讲什么，并生成一个文章概要性描述,注意不要有任何其他内容，只有文章概要描述，输出内容一定一定要在100字以内:" + treeJson;
}

export function sectionChangePrompt(treeJson, section, title, userPrompt) {
    const prompt = "你是一个文笔出色的编辑，现在用户有一篇文章，其中有一段需要你修改，文章大纲如下:\""
        + treeJson + "\"，" +
        "当前章节标题是：\"" +
        title + "\"，" +

        (
            (section == '' 
                || !section
                || section==NaN
            ) ? ('章节内容为空，需要你来生成这一节') :
                ("需要修改的章节是：\"" +
                    section + "\"，")
                +
                +"以下是用户的需求：\"" +
                userPrompt + "\"，请根据用户需求修改或生成本节，注意不要有任何多余废话，只有修改后的章节内容。"
        );
    //console.log(prompt);
    return prompt;
}

export function outlineChangePrompt(fullTreeJson,nodeTreeJson,userPrompt){
    const prompt = "你是一个文笔出色的编辑，现在有一个JSON类型的文章大纲树，全文大纲如下:\""
        + fullTreeJson + "\"，" +
        "当前章节是：\"" +
        nodeTreeJson + "\"，" +
        "以下是用户的需求：\"" +
        userPrompt + "\"，请根据用户需求，结合本章节在全文的上下文结构，尝试生成本章节的大纲（Markdown格式）一个标题占一行，如果有多层结构，使用分级标题"+
        +"，注意不要输出任何任何多余废话，输出结果只有本章节的子大纲，而不是全文大纲。";
    //console.log(prompt);
    return prompt;
}

export function generateArticlePrompt(mood,userPrompt){
    const prompt = "你是一个文笔出色的编辑，现在用户需要你为他写一篇文章，以下是用户的需求：\"" +
        userPrompt + "\"，除此之外，你应当使用"+mood+"的情绪与口吻来撰写文章。请根据用户需求，以及情绪要求，输出Markdown格式的文章。注意不要输出任何任何多余废话，只输出文章内容。";
    return prompt;
}