export default function PaymentSuccessPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Ευχαριστούμε!</h1>
        <p className="text-gray-600 mb-6">
          Μόλις ολοκληρωθεί η πληρωμή IRIS, θα λάβετε επιβεβαίωση και το λογιστικό σας γραφείο θα ενημερωθεί.
        </p>
        <div className="bg-blue-50 rounded-lg p-4 text-left">
          <p className="text-sm text-blue-800 font-medium mb-1">Σημαντικό:</p>
          <p className="text-sm text-blue-700">
            Βεβαιωθείτε ότι συμπεριλάβατε τον <strong>Αριθμό Αναφοράς</strong> στην αιτιολογία της συναλλαγής.
          </p>
        </div>
      </div>
    </div>
  )
}
