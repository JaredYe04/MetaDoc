# MetaDoc Markdown → LaTeX Stress Test

This document tests **many Markdown features** including nested syntax, edge cases, and tricky parsing situations.

---

## 1. Basic Formatting

Normal text with **bold**, *italic*, and ***bold+italic***.

Different bold syntax:

__bold using underscores__

Mixed nesting:

**bold and *italic inside*** text.

Edge case:

*italic with **bold inside***.

---

## 2. Inline Code and Escaping

Inline code:

`const x = 10;`

Inline code containing special characters:

`<div class="test">Hello</div>`

Escaped Markdown characters:

\*not italic\*

\# not a heading

\`not code\`

Backslash test:

\\

---

## 3. Links and Images

Simple link:

[OpenAI](https://openai.com)

Link with formatting:

[**bold link text**](https://example.com)

Image:

![Sample Image](https://example.com/image.png)

Image with alt containing symbols:

![Image: 100% coverage & testing](image.png)

---

## 4. Lists

Unordered list:

- Item A
- Item B
- Item C

Nested list:

- Level 1
  - Level 2
    - Level 3
      - Level 4

Mixed formatting inside lists:

- **Bold item**
- *Italic item*
- `Code item`

Ordered list:

1. First
2. Second
3. Third

Nested ordered list:

1. Item
   1. Subitem
   2. Subitem
2. Item

Mixed ordered + unordered:

1. Item
   - bullet
   - bullet

---

## 5. Blockquotes

> This is a quote
>
> With multiple paragraphs
>
>> Nested quote level 2
>>
>>> Nested quote level 3
>>>
>>

---

## 6. Code Blocks

Standard code block:

```python
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)
```


Code block with Markdown-like content:

```markdown
# This should NOT be parsed as a heading

**This should not be bold**
```

Code block containing LaTeX:

```latex
\begin{equation}
E = mc^2
\end{equation}
```

---

## 7. Tables


| Column A | Column B | Column C |
| -------- | -------- | -------- |
| A1       | B1       | C1       |
| A2       | **bold** | `code`   |
| A3       | *italic* | \$math\$ |

---

## 8. Horizontal Rules

---

---

---

---

## 9. Mathematics

Inline math:

\$E = mc^2\$

More complex inline math:

\$\\int\_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}\$

Math block:

\$\$
E = mc^2
\$\$

More complex math block:

\$\$
\\frac{d}{dx} \\left( \\int\_0^x f(t),dt \\right) = f(x)
\$\$

---

## 10. Edge Cases

Markdown edge cases:

***bold italic confusion***

`code with *asterisks* inside`

Text with many symbols:

!@#\$%^&\*()\_+-=[]{}|;':",.<>/?\~

Nested formatting chaos:

**bold *italic `code` italic* bold**

---

## 11. Long Paragraph Stress Test

Lorem ipsum dolor sit amet, consectetur adipiscing elit. **Vestibulum *interdum*** nisl sed *erat* fermentum, sed posuere `nulla` facilisis. Sed consequat **ultricies** magna, nec tincidunt *ipsum* dignissim sit amet.

---

## 12. Mixed Content

Here is everything combined:

* **Bold item with math \$E=mc^2\$**
* *Italic item with `inline code`*
* Link item: [Example](https://example.com/)

> Quote with **bold** and *italic* and `$math$`.

---

## End of Test
