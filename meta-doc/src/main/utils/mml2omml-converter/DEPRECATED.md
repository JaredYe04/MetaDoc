# 已废弃：MathML 到 OMML 转换器

⚠️ **此模块已废弃**

本项目已迁移到使用 `latex-to-omml` npm 包进行 LaTeX → OMML 的转换。

## 迁移说明

- **新方式**：直接使用 `latex-to-omml` 包，一步完成 LaTeX → MathML → OMML 转换
- **旧方式**：使用 `mathml-converter.ts` + `mml2omml-converter` 或 `mathml2omml` 库

## 保留原因

此模块暂时保留，仅用于：
1. 兼容旧的 `mathml-to-omml` IPC 接口（已废弃但保留以兼容）
2. 作为后备方案（如果需要）

## 建议

- 新代码应直接使用 `latex-to-omml` 包
- 不要在此模块上继续开发新功能
- 未来版本可能会完全移除此模块

