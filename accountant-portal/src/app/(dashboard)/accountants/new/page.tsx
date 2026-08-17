'use client'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

const schema = z.object({
  officeName: z.string().min(2, 'Απαιτείται επωνυμία γραφείου'),
  contactPerson: z.string().min(2, 'Απαιτείται υπεύθυνος'),
  email: z.string().email('Μη έγκυρο email'),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export default function NewAccountantPage() {
  const router = useRouter()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema)
  })

  async function onSubmit(data: FormData) {
    const res = await fetch('/api/accountants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      router.push('/accountants')
    } else {
      const err = await res.json()
      alert(err.error || 'Σφάλμα δημιουργίας')
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/accountants">
          <Button variant="ghost" size="sm">
            <ArrowLeft size={16} className="mr-1" />
            Πίσω
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Νέος Λογιστής</h1>
          <p className="text-gray-500">Προσθήκη νέου λογιστικού γραφείου</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Στοιχεία Γραφείου</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Επωνυμία Γραφείου *"
              {...register('officeName')}
              error={errors.officeName?.message}
              placeholder="π.χ. Λογιστικό Γραφείο Παπαδόπουλος"
            />
            <Input
              label="Υπεύθυνος *"
              {...register('contactPerson')}
              error={errors.contactPerson?.message}
              placeholder="Ονοματεπώνυμο υπευθύνου"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Email *"
                type="email"
                {...register('email')}
                error={errors.email?.message}
              />
              <Input
                label="Τηλέφωνο"
                {...register('phone')}
                placeholder="210xxxxxxx"
              />
            </div>
            <Input
              label="Διεύθυνση"
              {...register('address')}
              placeholder="Οδός, Αριθμός, ΤΚ, Πόλη"
            />
            <Textarea
              label="Σημειώσεις"
              {...register('notes')}
              rows={3}
            />
            <div className="flex gap-3 pt-2">
              <Button type="submit" loading={isSubmitting}>
                Δημιουργία Λογιστή
              </Button>
              <Link href="/accountants">
                <Button variant="outline">Ακύρωση</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
