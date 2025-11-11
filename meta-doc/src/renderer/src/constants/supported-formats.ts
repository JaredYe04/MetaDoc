import type { DocumentTemplate, SupportedFormat } from '../types/formats';

export const SUPPORTED_FORMATS: SupportedFormat[] = [
  {
    id: 'md',
    label: 'Markdown',
    labelKey: 'newDocument.formats.markdown.label',
    description: 'Markdown 文档',
    descriptionKey: 'newDocument.formats.markdown.description',
    extension: '.md',
    defaultTemplateId: 'blank',
    templates: [
      {
        id: 'blank',
        label: '空白文档',
        labelKey: 'newDocument.templates.markdown.blank.label',
        description: '创建一个空白的 Markdown 文档',
        descriptionKey: 'newDocument.templates.markdown.blank.description',
        content: '',
      },
      {
        id: 'article',
        label: '文章模板',
        labelKey: 'newDocument.templates.markdown.article.label',
        description: '包含基本结构的文章模板',
        descriptionKey: 'newDocument.templates.markdown.article.description',
        content: [
          '# 标题',
          '',
          '## 摘要',
          '',
          '在这里撰写摘要内容。',
          '',
          '## 正文',
          '',
          '- 要点一',
          '- 要点二',
          '',
          '## 结论',
          '',
          '在这里撰写结论内容。',
          '',
        ].join('\n'),
      },
    ],
  },
  {
    id: 'tex',
    label: 'LaTeX',
    labelKey: 'newDocument.formats.latex.label',
    description: 'LaTeX 文档',
    descriptionKey: 'newDocument.formats.latex.description',
    extension: '.tex',
    defaultTemplateId: 'article',
    templates: [
      {
        id: 'article',
        label: '标准文章',
        labelKey: 'newDocument.templates.latex.article.label',
        description: '包含基础结构的 LaTeX 文章模板',
        descriptionKey: 'newDocument.templates.latex.article.description',
        content: [
          '\\documentclass{article}',
          '\\usepackage{ctex}',
          '\\usepackage{amsmath}',
          '\\usepackage{amssymb}',
          '',
          '\\title{未命名文档}',
          '\\author{}',
          '\\date{\\today}',
          '',
          '\\begin{document}',
          '\\maketitle',
          '',
          '\\section{引言}',
          '请在此处撰写引言内容。',
          '',
          '\\section{主体}',
          '请在此处撰写主体内容。',
          '',
          '\\section{结论}',
          '请在此处撰写结论内容。',
          '',
          '\\end{document}',
          '',
        ].join('\n'),
      },
      {
        id: 'report',
        label: '报告模板',
        labelKey: 'newDocument.templates.latex.report.label',
        description: '适用于学术报告的模板',
        descriptionKey: 'newDocument.templates.latex.report.description',
        content: [
          '\\documentclass{report}',
          '\\usepackage{ctex}',
          '\\usepackage{amsmath}',
          '\\usepackage{amssymb}',
          '',
          '\\title{报告标题}',
          '\\author{}',
          '\\date{\\today}',
          '',
          '\\begin{document}',
          '\\maketitle',
          '',
          '\\chapter{引言}',
          '请在此处撰写引言内容。',
          '',
          '\\chapter{内容}',
          '请在此处撰写正文内容。',
          '',
          '\\chapter{结论}',
          '请在此处撰写结论内容。',
          '',
          '\\end{document}',
          '',
        ].join('\n'),
      },
    ],
  },
];

export const getSupportedFormats = (): SupportedFormat[] => SUPPORTED_FORMATS;

export const findFormatById = (id: string): SupportedFormat | undefined =>
  SUPPORTED_FORMATS.find((format) => format.id === id);

export const findFormatTemplate = (
  formatId: string,
  templateId?: string,
): DocumentTemplate | undefined => {
  const format = findFormatById(formatId);
  if (!format) return undefined;
  if (!templateId) {
    return format.templates.find((tpl) => tpl.id === format.defaultTemplateId) ?? format.templates[0];
  }
  return format.templates.find((tpl) => tpl.id === templateId);
};

