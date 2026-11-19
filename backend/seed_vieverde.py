"""
Idempotent seed for Vie Verde Villas (vieverde tenant) demo data.
Called from main.py on startup — safe to run multiple times.
"""

TENANT = 'vieverde'


def seed_vieverde(db):
    from models import GuestPortalSettings, WelcomeGuideItem, LocalRecommendation, MarketplaceItem

    # ── Portal Settings ──────────────────────────────────────────────────────
    if not db.query(GuestPortalSettings).filter_by(tenant=TENANT).first():
        db.add(GuestPortalSettings(
            tenant=TENANT,
            from_name='Vie Verde Villas',
            welcome_message=(
                "Dear Guest,\n\n"
                "Welcome to Villa Vie. We are thrilled to host you in our peaceful corner of Crete. "
                "Nestled in the hills of Rodia, our villa offers panoramic sea views, modern amenities, "
                "and an atmosphere of pure relaxation.\n\n"
                "We hope your stay is filled with beautiful moments and unforgettable experiences. "
                "Please take a few minutes to read this guide — it will help you enjoy your stay "
                "safely and comfortably.\n\n"
                "Warm wishes,\nThe Vie Verde Villas Team"
            ),
            checkin_time='14:00',
            checkout_time='11:00',
            manager_phone='+30 694 557 0927',
            manager_email='info@vieverde.gr',
            emergency_contact='112',
            hospital_name='Venizelio General Hospital, Heraklion',
            hospital_phone='+30 2810 368000',
            police_phone='100',
            ambulance_phone='112',
            fire_phone='199',
        ))

    # ── Welcome Guide ────────────────────────────────────────────────────────
    if db.query(WelcomeGuideItem).filter_by(tenant=TENANT).count() == 0:
        guide = [
            # Wi-Fi
            ('wifi', 'Wi-Fi Access',
             'Network: Vieverde\nPassword: 12345678', 0),

            # Appliances
            ('appliances', 'Washing Machine',
             'Western bathroom, 1st floor. Detergents provided.', 0),
            ('appliances', 'Dishwasher',
             'In the kitchen. Detergents provided.', 1),
            ('appliances', 'Oven, Stove & Microwave',
             'In the kitchen. Kitchen essentials are in the drawers.', 2),
            ('appliances', 'Coffee Machines',
             'Filter coffee & Nespresso machine available.', 3),
            ('appliances', 'Kitchen & Kitchenettes',
             '1 main kitchen (full fridge & oven) + 2 kitchenettes with mini fridges — one on each floor.', 4),
            ('appliances', 'Smart TV with Netflix',
             'Use your own login. Log out before check-out.', 5),
            ('appliances', 'Filtered Water',
             'Large handle = tap water · Small handle = filtered drinking water.', 6),
            ('appliances', 'Dimmable Lights',
             'Long-press the light switch to gradually adjust brightness.', 7),
            ('appliances', 'Aroma & Chromotherapy Devices',
             'Available in some bathrooms. Plug into the nearby socket for a spa-like experience.', 8),
            ('appliances', 'Solar Water Heater',
             'Hot water is available 24/7 — the solar system runs automatically. No action needed.', 9),

            # Pool
            ('pool', 'Pool Rules & Safety',
             (
                 'Pool depth: 1.50 m · No lifeguard on duty\n\n'
                 'NO DIVING — Strictly prohibited, especially near the hydromassage area. Serious risk of injury.\n\n'
                 'NO INFLATABLES — Inflatable floats, rings, and toys are not permitted in the pool.\n\n'
                 'NO DRINKS OR OBJECTS IN THE WATER — Keep glasses, bottles, and all objects out of the pool.\n\n'
                 'NO SWIMMING UNDER THE INFLUENCE OF ALCOHOL — Safety always comes first.\n\n'
                 'CHILDREN MUST BE SUPERVISED AT ALL TIMES — Adults are responsible for minors in and around the pool throughout the entire stay.\n\n'
                 'DO NOT WALK ON THE POOL EDGE — The upper edge is elevated and slippery — serious risk of falling and injury.'
             ), 0),
            ('pool', 'Hydromassage',
             'Turns on and off with the button located directly in front of the hydromassage unit.', 1),

            # BBQ
            ('bbq', 'Outdoor BBQ',
             (
                 'The BBQ uses charcoal. Never leave the BBQ unattended while in use. '
                 'Fully extinguish and allow to cool before leaving.\n\n'
                 'BBQ TOOLS & TRAYS — Located in the cabinet directly underneath the oven in the kitchen. '
                 'Use only these for outdoor cooking.\n\n'
                 'Do NOT use household cookware on the BBQ — Regular pots, pans, and kitchen trays are not '
                 'designed for open-flame use and will be permanently damaged.'
             ), 0),

            # Weather
            ('weather', 'Hot Water Backup (Cloudy Days)',
             (
                 'Without sunshine, the solar heater does not work. Activate the electric backup:\n\n'
                 '1. Find the V TIMER breaker on the ground floor electrical panel.\n'
                 '2. Open it and press the red START button.\n'
                 '3. The timer switches off automatically.\n'
                 '4. Repeat if you need more hot water.'
             ), 0),
            ('weather', 'Strong Wind',
             'Always close the sun umbrellas when it is windy or when leaving them unsupervised. '
             'Strong winds permanently damage the umbrellas. Never leave them open and unattended.', 1),
            ('weather', 'Rain',
             'In case of rain, please collect the cushions from the sun loungers and outdoor sofas '
             'and bring them to the protected courtyard behind the fireplace.', 2),

            # Guidelines
            ('guidelines', 'House Rules',
             (
                 'NO SMOKING INDOORS — Smoking is permitted outdoors only.\n\n'
                 'QUIET HOURS AFTER 23:00 — Please avoid loud music or gatherings after 23:00.\n\n'
                 'NO PARTIES OR EVENTS — Gatherings and events require prior written approval from property management.\n\n'
                 'TREAT THE PROPERTY WITH CARE — Please report any damage or maintenance issues as soon as possible.\n\n'
                 'TOILET USE — Very Important: Do not throw toilet paper or any items into the toilet. '
                 'Greek plumbing systems cannot handle waste in the pipes. Use the bin provided in each bathroom.'
             ), 0),

            # Sustainability
            ('sustainability', 'Energy & Sustainability',
             (
                 'LIGHTS — Switch off lights in rooms you are not using. '
                 'When you leave the villa, please ensure all lights are switched off.\n\n'
                 'AIR CONDITIONING — Always switch off when you leave. Our villa has a next-generation climate '
                 'control system with rapid cooling and heating — you will be comfortable within minutes upon return. '
                 'Please switch off ALL air conditioning units every time you leave the villa.\n\n'
                 'RECYCLING — A dedicated recycling bin is available on the property.\n\n'
                 'PLANTS — The villa has potted plants indoors and outdoors that rely on you during your stay. '
                 'The garden beds are watered automatically, but the potted plants need a little water every day or two.'
             ), 0),

            # Alexa
            ('alexa', 'Alexa Voice Assistant',
             (
                 'An Alexa device is on the kitchen island. Say "Alexa" followed by your request.\n\n'
                 'MUSIC:\n'
                 '"Alexa, play relaxing lounge music."\n'
                 '"Alexa, play jazz music." / "Alexa, play Coldplay." / "Alexa, play the song Despacito."\n\n'
                 'ATMOSPHERE:\n'
                 '"Alexa, play ocean sounds." / "Alexa, play nature sounds for sleeping."\n'
                 '"Alexa, play rain sounds." / "Alexa, play spa music." / "Alexa, play beach waves."\n\n'
                 'TIMERS & ALARMS:\n'
                 '"Alexa, set a 20-minute timer for the BBQ."\n'
                 '"Alexa, wake me up at 7:30 AM." / "Alexa, remind me to pack at 8 PM."\n\n'
                 'VOLUME:\n'
                 '"Alexa, volume up / volume down." / "Alexa, set volume to 5." / "Alexa, mute."\n\n'
                 'WEATHER & INFO:\n'
                 '"Alexa, what\'s the weather today?" / "Alexa, what time is sunset today?"\n\n'
                 'EXPLORE CRETE:\n'
                 '"Alexa, tell me about the Palace of Knossos."\n'
                 '"Alexa, tell me the myth of the Minotaur." / "Alexa, who is Zeus in Greek mythology?"\n\n'
                 'GREEK PHRASES:\n'
                 '"Alexa, how do you say \'thank you\' in Greek?"\n'
                 '"Alexa, how do you say \'good morning\' in Greek?"\n'
                 '"Alexa, how do you say \'where is the beach\' in Greek?"'
             ), 0),

            # Home Cinema
            ('cinema', 'Home Cinema Room',
             (
                 'Large-screen TV + Soundbar — Cinematic screen with immersive audio for a true movie experience.\n\n'
                 'Spacious Sofa + Dimmable Lighting — Comfortable seating for everyone. '
                 'Long-press the light switch to dim lights for the full cinema atmosphere.\n\n'
                 'Streaming — Use your own Netflix and personal accounts freely. '
                 'Please log out of all accounts before check-out.'
             ), 0),

            # Check-out
            ('checkout', 'Check-Out Instructions',
             (
                 'Before leaving the villa, please go through the following checklist:\n\n'
                 'KEYS — Place them in the key box at the main entrance (garage gate).\n\n'
                 'AIR CONDITIONING — Switch off ALL A/C units.\n\n'
                 'LIGHTS — Turn off all lights throughout the villa.\n\n'
                 'SMART TV & ALL STREAMING APPS — Log out of Netflix and all streaming services on every device.\n\n'
                 'UMBRELLAS — Close all outdoor sun umbrellas.\n\n'
                 'BBQ — Ensure the BBQ is fully extinguished and cooled before leaving.\n\n'
                 'WINDOWS & DOORS — Lock all windows and doors securely.\n\n'
                 'Thank you for your care. A well-maintained villa means every guest gets to enjoy it at its best '
                 '— including you, should you choose to return.'
             ), 0),

            # Google Review
            ('review', 'Share Your Experience',
             (
                 'Did you enjoy the villa, the private pool and the sea view?\n\n'
                 'Please share your experience with a quick Google review — it helps us greatly.\n\n'
                 'www.vieverde.gr'
             ), 0),
        ]
        for category, title, content, sort_order in guide:
            db.add(WelcomeGuideItem(
                tenant=TENANT,
                category=category,
                title=title,
                content=content,
                sort_order=sort_order,
            ))

    # ── Local Recommendations ────────────────────────────────────────────────
    if db.query(LocalRecommendation).filter_by(tenant=TENANT).count() == 0:
        local = [
            dict(
                category='restaurant',
                name='Taverna Meteoro',
                description='Traditional Greek taverna in Rodia with local specialties. Reservations recommended.',
                phone='+30 694 557 0927',
                sort_order=0,
            ),
            dict(
                category='restaurant',
                name='Taverna To Rodi',
                description='Family-run taverna in Rodia village with authentic Cretan cuisine.',
                phone='+30 694 444 0832',
                sort_order=1,
            ),
            dict(
                category='attraction',
                name='Palace of Knossos',
                description=(
                    'The legendary Bronze Age palace of the Minoan civilization — one of the most '
                    'important archaeological sites in Europe. Just 15 minutes from the villa.'
                ),
                address='Knossos, Heraklion, Crete',
                maps_url='https://maps.google.com/?q=Palace+of+Knossos+Heraklion',
                sort_order=0,
            ),
            dict(
                category='attraction',
                name='Heraklion Archaeological Museum',
                description=(
                    'One of the greatest museums in Greece, home to the world\'s most important '
                    'collection of Minoan art and artifacts. Located in the city centre, 10 min away.'
                ),
                address='Xanthoudidou 2, Heraklion',
                maps_url='https://maps.google.com/?q=Heraklion+Archaeological+Museum',
                sort_order=1,
            ),
            dict(
                category='beach',
                name='Ammoudara Beach',
                description=(
                    'A long sandy beach just 10 minutes away, ideal for families and swimming. '
                    'Sun beds, tavernas, and water sports available.'
                ),
                address='Ammoudara, Heraklion',
                maps_url='https://maps.google.com/?q=Ammoudara+Beach+Heraklion',
                sort_order=0,
            ),
            dict(
                category='beach',
                name='Agia Pelagia',
                description=(
                    'A picturesque sheltered bay with crystal-clear waters, 20 minutes west of the villa. '
                    'Great for snorkelling and swimming.'
                ),
                address='Agia Pelagia, Heraklion',
                maps_url='https://maps.google.com/?q=Agia+Pelagia+Crete',
                sort_order=1,
            ),
            dict(
                category='shopping',
                name='1866 Market Street, Heraklion',
                description=(
                    'Heraklion\'s famous covered market street — the best place to buy local olive oil, '
                    'thyme honey, Cretan cheeses, herbs, and souvenirs. 10 minutes by car.'
                ),
                address='1866 Market, Heraklion City Centre',
                maps_url='https://maps.google.com/?q=1866+Market+Heraklion',
                sort_order=0,
            ),
        ]
        for item in local:
            db.add(LocalRecommendation(tenant=TENANT, **item))

    # ── Marketplace Items ────────────────────────────────────────────────────
    if db.query(MarketplaceItem).filter_by(tenant=TENANT).count() == 0:
        market = [
            dict(title='Airport Transfer',
                 description='Private comfortable transfer to/from Heraklion Airport (HER). Available 24/7, any flight time.',
                 price=45.0, sort_order=0),
            dict(title='Welcome Grocery Package',
                 description='We shop for your arrival essentials — fresh produce, bread, drinks, and breakfast items ready when you arrive.',
                 price=15.0, sort_order=1),
            dict(title='BBQ Package',
                 description='Charcoal, firelighters, and a fresh selection of Cretan meats and vegetables delivered to your villa.',
                 price=35.0, sort_order=2),
            dict(title='Wine & Local Delicacies Basket',
                 description='A curated welcome basket with Cretan wine, extra virgin olive oil, thyme honey, and local cheeses.',
                 price=40.0, sort_order=3),
            dict(title='Extra Mid-Stay Cleaning',
                 description='Full clean, fresh towels, and linen change. Scheduled at a time convenient for you.',
                 price=50.0, sort_order=4),
            dict(title='Guided Day Tour — Crete Highlights',
                 description='Private guided tour to Knossos Palace, Heraklion Old Town, and the 1866 Market. Includes licensed guide.',
                 price=120.0, sort_order=5),
            dict(title='Boat Trip — Cretan Coast',
                 description='Half-day private boat trip along the Heraklion coastline with swimming stops and snorkelling equipment.',
                 price=150.0, sort_order=6),
        ]
        for item in market:
            db.add(MarketplaceItem(tenant=TENANT, **item))

    db.commit()
