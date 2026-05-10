/**
 * ErrorBoundary.tsx — 全域錯誤邊界
 *
 * React 預設行為：子元件 throw 時整顆樹卸載 → 畫面全白。
 * 用 ErrorBoundary 包住可疑頁面，至少能把錯誤訊息顯示給老師看，
 * 方便回報給開發者。
 */

import React from 'react'

interface Props {
  children: React.ReactNode
  fallbackTitle?: string
}

interface State {
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, errorInfo: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReset = (): void => {
    this.setState({ error: null, errorInfo: null })
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-red-50 to-rose-100 p-6 overflow-auto">
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-lg border border-red-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="text-3xl">⚠️</div>
            <div>
              <h2 className="text-lg font-bold text-red-700">
                {this.props.fallbackTitle ?? '頁面發生錯誤'}
              </h2>
              <p className="text-xs text-red-500 mt-0.5">
                這通常是程式 bug，把下列訊息回報給開發者可協助修正
              </p>
            </div>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-xs font-mono text-red-700 break-all">
              {this.state.error.name}: {this.state.error.message}
            </p>
          </div>

          {this.state.error.stack && (
            <details className="mb-4">
              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                顯示完整堆疊
              </summary>
              <pre className="mt-2 p-3 bg-gray-900 text-gray-100 text-[10px] rounded-lg overflow-auto max-h-60 font-mono">
                {this.state.error.stack}
              </pre>
            </details>
          )}

          <div className="flex gap-2">
            <button
              onClick={this.handleReset}
              className="
                h-9 px-4 rounded-lg
                bg-red-600 hover:bg-red-700 text-white
                text-sm font-medium
              "
            >
              重試本頁
            </button>
            <button
              onClick={() => location.reload()}
              className="
                h-9 px-4 rounded-lg
                bg-gray-100 hover:bg-gray-200 text-gray-700
                text-sm font-medium
              "
            >
              重新載入應用
            </button>
          </div>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
