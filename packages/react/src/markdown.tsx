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
          h1: ({ children }) => (
            <h1 className='mt-4 mb-2 text-xl font-bold'>{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className='mt-4 mb-2 text-lg font-bold'>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className='mt-3 mb-1 text-base font-semibold'>{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className='mt-3 mb-1 text-sm font-semibold'>{children}</h4>
          ),
          h5: ({ children }) => (
            <h5 className='mt-2 mb-1 text-sm font-semibold'>{children}</h5>
          ),
          h6: ({ children }) => (
            <h6 className='mt-2 mb-1 text-xs font-semibold uppercase tracking-wide'>
              {children}
            </h6>
          ),
          p: ({ children }) => <p className='mb-2 last:mb-0'>{children}</p>,
          ul: ({ children }) => (
            <ul className='mb-2 list-disc space-y-1 ps-5'>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className='mb-2 list-decimal space-y-1 ps-5'>{children}</ol>
          ),
          li: ({ children }) => <li className='ps-1'>{children}</li>,
          code: ({ children, className }) => {
            const isBlock = className?.includes('language-')
            return isBlock ? (
              <pre className='my-2 overflow-x-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-100'>
                <code className={className}>{children}</code>
              </pre>
            ) : (
              <code className='rounded bg-muted px-1.5 py-0.5 text-xs'>
                {children}
              </code>
            )
          },
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          table: ({ children }) => (
            <div className='my-2 overflow-x-auto'>
              <table className='w-full border-collapse text-sm'>
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead>{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => (
            <th className='border border-border bg-muted px-3 py-1.5 text-start font-semibold'>
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className='border border-border px-3 py-1.5'>{children}</td>
          ),
          blockquote: ({ children }) => (
            <blockquote className='my-2 border-s-4 border-muted-foreground/30 ps-3 text-muted-foreground'>
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target='_blank'
              rel='noopener noreferrer'
              className='text-primary underline underline-offset-2'
            >
              {children}
            </a>
          ),
          hr: () => <hr className='my-3 border-border' />,
          strong: ({ children }) => (
            <strong className='font-semibold'>{children}</strong>
          ),
          em: ({ children }) => <em className='italic'>{children}</em>,
          del: ({ children }) => (
            <del className='text-muted-foreground line-through'>{children}</del>
          ),
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt}
              className='my-2 max-w-full rounded-lg border border-border'
            />
          ),
          input: ({ type, checked, disabled }) =>
            type === 'checkbox' ? (
              <input
                type='checkbox'
                checked={checked}
                disabled={disabled}
                readOnly
                className='me-1 align-middle'
              />
            ) : null,
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
