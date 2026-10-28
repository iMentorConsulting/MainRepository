'use client'
import { useRef, useState } from 'react'
import { ImageIcon, X, Upload } from 'lucide-react'

interface Props {
  value: string
  onChange: (v: string) => void
}

export function HeroImageUpload({ value, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function handleFile(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('Παρακαλώ επιλέξτε αρχείο εικόνας.'); return }
    if (file.size > 3 * 1024 * 1024) { alert('Μέγιστο μέγεθος εικόνας: 3 MB.'); return }
    const reader = new FileReader()
    reader.onload = e => onChange(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">
        Εικόνα Κάρτας Προγράμματος (Hero Image)
      </label>

      {value ? (
        <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Hero" className="w-full h-40 object-cover" />
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors shadow"
          >
            <X size={14} />
          </button>
          <div className="absolute bottom-2 left-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-xs bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg text-gray-700 hover:bg-white transition-colors shadow"
            >
              Αλλαγή εικόνας
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
          onClick={() => fileRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 h-36 rounded-xl border-2 border-dashed cursor-pointer transition-colors
            ${dragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 bg-gray-50 hover:border-indigo-300 hover:bg-gray-100'}`}
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Upload size={20} className="text-indigo-600" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700">Κάντε κλικ ή σύρετε εικόνα εδώ</p>
            <p className="text-xs text-gray-400 mt-0.5">JPG, PNG, WebP · Μέγιστο 3 MB</p>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => handleFile(e.target.files?.[0] || null)}
      />

      {/* Also allow URL input */}
      <div className="flex gap-2 items-center mt-1">
        <ImageIcon size={14} className="text-gray-400 flex-shrink-0" />
        <input
          type="url"
          placeholder="ή επικολλήστε URL εικόνας..."
          value={value.startsWith('data:') ? '' : value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 text-xs rounded-lg border border-gray-200 px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-gray-700 placeholder-gray-400"
        />
      </div>
    </div>
  )
}
