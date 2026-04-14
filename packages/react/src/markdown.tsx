import { useState, type ReactNode } from 'react'
import ReactMarkdown, { type Options as ReactMarkdownOptions } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

export type MarkdownProps = {
  children: string
  className?: string
  /** Extra react-markdown options (components, remarkPlugins, rehypePlugins, etc.) */
  options?: Omit<ReactMarkdownOptions, 'children'>
}

/**
 * Modern Markdown renderer with:
 * - GitHub-flavored markdown (tables, task lists, strikethrough, autolinks)
 * - Syntax highlighting via highlight.js (import `@axe-ai-sdk/react/styles.css`
 *   or any highlight.js theme to activate colors)
 * - Fenced code blocks with a copy button + language badge
 * - External links open in new tab with `rel="noreferrer"`
 */
export function Markdown({ children, className, options }: MarkdownProps) {
  return (
    <div className={className ? `${className} axe-md` : 'axe-md'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, ...(options?.remarkPlugins ?? [])]}
        rehypePlugins={[
          [rehypeHighlight, { detect: true, ignoreMissing: true }],
          ...(options?.rehypePlugins ?? []),
        ]}
        components={{
          a: ({ node: _n, ...props }) => (
            <a {...props} target='_blank' rel='noreferrer' />
          ),
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          ...(options?.components ?? {}),
        }}
        {...options}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const { code, language } = extractCode(children)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <div className='axe-md__codeblock'>
      <div className='axe-md__codehead'>
        <span className='axe-md__codelang'>{language || 'text'}</span>
        <button
          type='button'
          className='axe-md__copy'
          onClick={handleCopy}
          aria-label='Copy code'
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  )
}

function extractCode(node: ReactNode): { code: string; language: string } {
  // react-markdown wraps fenced code as <pre><code class="language-xxx">...</code></pre>
  // The child here is the <code> element.
  let code = ''
  let language = ''

  const walk = (n: ReactNode) => {
    if (n == null || typeof n === 'boolean') return
    if (typeof n === 'string' || typeof n === 'number') {
      code += String(n)
      return
    }
    if (Array.isArray(n)) {
      n.forEach(walk)
      return
    }
    if (typeof n === 'object' && 'props' in n) {
      const props = (n as { props?: { className?: string; children?: ReactNode } }).props
      if (props?.className && !language) {
        const m = props.className.match(/language-([\w-]+)/)
        if (m) language = m[1] ?? ''
      }
      walk(props?.children)
    }
  }
  walk(node)

  return { code: code.replace(/\n$/, ''), language }
}
