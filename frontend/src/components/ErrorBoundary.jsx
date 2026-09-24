import { Component } from 'react'
import { ExclamationTriangleIcon, ArrowPathIcon } from '@heroicons/react/24/outline'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center">
          <ExclamationTriangleIcon className="w-14 h-14 text-red-300 mb-4" />
          <h2 className="text-lg font-bold text-gray-800 mb-2">Κάτι πήγε στραβά</h2>
          <p className="text-sm text-gray-500 max-w-md mb-1">
            {this.state.error?.message || 'Απροσδόκητο σφάλμα'}
          </p>
          <p className="text-xs text-gray-400 mb-6">Ανοίξτε την κονσόλα (F12) για λεπτομέρειες.</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Επανεκκίνηση
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
