import os, tempfile, unittest
_tmp = tempfile.mkdtemp()
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/la.db")
os.environ.setdefault("SECRET_KEY", "test")
from collections import Counter
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
import models  # noqa: F401
from database import Base
import lead_assignment as la


class WeightTests(unittest.TestCase):
    def setUp(self):
        eng = create_engine(f"sqlite:///{_tmp}/w_{id(self)}.db")
        Base.metadata.create_all(eng)
        self.db = Session(eng)

    def run_n(self, n):
        out = [la.pick_next(self.db) for _ in range(n)]
        self.db.commit()
        return Counter(out)

    def test_off_by_default(self):
        self.assertIsNone(la.pick_next(self.db))

    def test_weights_are_respected(self):
        la.save_config(self.db, True, {"STELLA": 50, "VALLIA": 30, "SOFIA": 20}, "HARIS")
        self.assertEqual(self.run_n(100), Counter({"STELLA": 50, "VALLIA": 30, "SOFIA": 20}))

    def test_zero_weight_gets_nothing(self):
        la.save_config(self.db, True, {"STELLA": 1, "VALLIA": 0, "SOFIA": 1}, "HARIS")
        c = self.run_n(20)
        self.assertEqual(c["VALLIA"], 0)
        self.assertEqual((c["STELLA"], c["SOFIA"]), (10, 10))

    def test_change_resets_cycle(self):
        la.save_config(self.db, True, {"STELLA": 1, "VALLIA": 1, "SOFIA": 1}, "HARIS")
        self.run_n(7)
        la.save_config(self.db, True, {"STELLA": 0, "VALLIA": 0, "SOFIA": 1}, "HARIS")
        self.assertEqual(self.run_n(5), Counter({"SOFIA": 5}))

    def test_validation(self):
        with self.assertRaises(ValueError):
            la.save_config(self.db, True, {"STELLA": 0, "VALLIA": 0, "SOFIA": 0}, "HARIS")
        with self.assertRaises(ValueError):
            la.save_config(self.db, True, {"STELLA": -1, "VALLIA": 1, "SOFIA": 1}, "HARIS")

    def test_disabled_keeps_old_behaviour(self):
        la.save_config(self.db, False, {"STELLA": 1, "VALLIA": 1, "SOFIA": 1}, "HARIS")
        self.assertIsNone(la.pick_next(self.db))


if __name__ == "__main__":
    unittest.main()
