'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LogoUploader } from '@/components/shared/logo-uploader'
import { ArrowLeft, Building2 } from 'lucide-react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

const schema = z.object({
  officeName: z.string().min(2),
  contactPerson: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  active: z.boolean().optional(),
})
type FormData = z.infer<typeof schema>

export default function AccountantDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'
  const [accountant, setAccountant] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema)
  })

  useEffect(() => {
    fetch(`/api/accountants/${id}`)
      .then(async r => {
        if (!r.ok) { setAccountant(null); return null }
        return r.json()
      })
      .then(data => {
        if (!data) return
        setAccountant(data)
        setLogoUrl(data.logoUrl || null)
        reset({
          officeName: data.officeName,
          contactPerson: data.contactPerson,
          email: data.email,
          phone: data.phone || '',
          address: data.address || '',
          notes: data.notes || '',
          active: data.active,
        })
      })
      .finally(() => setLoading(false))
  }, [id])

  async function onSubmit(data: FormData) {
    const res = await fetch(`/api/accountants/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, logoUrl }),
    })
    if (res.ok) {
      if (isAdmin) router.push('/accountants')
      else alert('Τα στοιχεία αποθηκεύτηκαν!')
    } else {
      alert('Σφάλμα αποθήκευσης. Δοκιμάστε ξανά.')
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full" />
    </div>
  )

  if (!accountant) return <div className="text-center text-gray-500">Δεν βρέθηκε λογιστής</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/accountants">
          <Button variant="ghost" size="sm"><ArrowLeft size={16} className="mr-1" />Πίσω</Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{accountant.officeName}</h1>
          <p className="text-gray-500">{accountant.contactPerson}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Επεξεργασία Στοιχείων</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input label="Επωνυμία *" {...register('officeName')} error={errors.officeName?.message} />
                <Input label="Υπεύθυνος *" {...register('contactPerson')} error={errors.contactPerson?.message} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Email *" type="email" {...register('email')} error={errors.email?.message} disabled={!isAdmin} />
                  <Input label="Τηλέφωνο" {...register('phone')} />
                </div>
                <LogoUploader
                  label="Λογότυπο γραφείου (PNG, transparent)"
                  value={logoUrl}
                  onChange={setLogoUrl}
                  helperText="Εμφανίζεται στο πάνω μέρος των email καμπανιών προς τους πελάτες σας. Συνιστάται PNG με διαφανές φόντο, έως 1MB."
                />
                <Input label="Διεύθυνση" {...register('address')} />
                <Textarea label="Σημειώσεις" {...register('notes')} rows={3} disabled={!isAdmin} />
                <div className="flex items-center gap-2">
                  <input type="checkbox" {...register('active')} id="active" className="rounded" disabled={!isAdmin} />
                  <label htmlFor="active" className="text-sm text-gray-700">Ενεργός</label>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button type="submit" loading={isSubmitting}>Αποθήκευση</Button>
                  <Link href={isAdmin ? '/accountants' : '/dashboard'}><Button variant="outline">Ακύρωση</Button></Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Στατιστικά</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Επιχειρήσεις</span>
                <span className="font-semibold">{accountant.businesses?.length ?? 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Χρήστες</span>
                <span className="font-semibold">{accountant.users?.length ?? 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Κατάσταση</span>
                <Badge variant={accountant.active ? 'success' : 'secondary'}>
                  {accountant.active ? 'Ενεργός' : 'Ανενεργός'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  )
}
