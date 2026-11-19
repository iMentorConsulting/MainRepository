export default function PaymentCancelledPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-yellow-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Η Πληρωμή Ακυρώθηκε</h1>
        <p className="text-gray-600 mb-6">
          Η διαδικασία πληρωμής ακυρώθηκε. Δεν έγινε χρέωση στον λογαριασμό σας.
        </p>
        <div className="bg-yellow-50 rounded-lg p-4 text-left mb-6">
          <p className="text-sm text-yellow-800">
            Μπορείτε να επιστρέψετε στον σύνδεσμο πληρωμής που σας έστειλε το λογιστικό σας
            γραφείο για να ολοκληρώσετε την πληρωμή.
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500 text-center">
            Εάν αντιμετωπίζετε πρόβλημα, επικοινωνήστε με το λογιστικό σας γραφείο ή
            με την I-MENTOR.
          </p>
        </div>
      </div>
    </div>
  )
}
