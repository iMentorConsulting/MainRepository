'use client'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Image as ImageIcon, Upload, X } from 'lucide-react'

const MAX_SIZE = 1024 * 1024 // 1MB — logos are small, keeps base64 payloads reasonable

interface LogoUploaderProps {
  label: string
  value?: string | null
  onChange: (dataUrl: string | null) => void
  helperText?: string
}

// Reads an image file client-side and hands the parent a base64 data URL —
// no external storage needed since logos are small and Accountant.logoUrl /
// AppSetting.imentorLogoUrl are plain text columns.
export function LogoUploader({ label, value, onChange, helperText }: LogoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')

  function handleFile(file: File | null) {
    if (!file) return
    setError('')
    if (file.type !== 'image/png') {
      setError('Παρακαλούμε ανεβάστε λογότυπο σε μορφή PNG με διαφανές φόντο (transparent).')
      return
    }
    if (file.size > MAX_SIZE) {
      setError('Το αρχείο είναι πολύ μεγάλο (μέγιστο 1MB).')
      return
    }
    const reader = new FileReader()
    reader.onload = () => onChange(reader.result as string)
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-3">
        <div className="w-20 h-20 rounded-xl border border-slate-600 bg-slate-900 flex items-center justify-center overflow-hidden">
          {value ? (
            <img src={value} alt={label} className="max-w-full max-h-full object-contain" />
          ) : (
            <ImageIcon size={24} className="text-slate-600" />
          )}
        </div>
        <div className="space-y-1.5">
          <input
            ref={inputRef}
            type="file"
            accept="image/png"
            className="hidden"
            onChange={e => handleFile(e.target.files?.[0] || null)}
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              <Upload size={12} className="mr-1" />
              Ανέβασμα PNG
            </Button>
            {value && (
              <Button type="button" variant="ghost" size="sm" onClick={() => { onChange(null); if (inputRef.current) inputRef.current.value = '' }}>
                <X size={12} className="mr-1" />
                Αφαίρεση
              </Button>
            )}
          </div>
          <p className="text-xs text-gray-400">{helperText || 'Συνιστάται PNG με διαφανές (transparent) φόντο, έως 1MB.'}</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  )
}
