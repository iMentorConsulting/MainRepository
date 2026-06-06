import Link from 'next/link'

export default function PaymentSuccessPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Πληρωμή Επιτυχής!</h1>
        <p className="text-gray-600 mb-6">
          Η πληρωμή σας ολοκληρώθηκε με επιτυχία. Θα λάβετε επιβεβαίωση στο email σας.
        </p>
        <div className="bg-blue-50 rounded-lg p-4 text-left mb-6">
          <p className="text-sm text-blue-800">
            Το λογιστικό σας γραφείο και η <strong>I-MENTOR</strong> θα επικοινωνήσουν σύντομα
            για τα επόμενα βήματα.
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-4 text-left">
          <p className="text-xs text-gray-500 text-center">
            Μπορείτε να κλείσετε αυτή τη σελίδα με ασφάλεια.
          </p>
        </div>
      </div>
    </div>
  )
}
