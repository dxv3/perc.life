import requests
import os
from urllib.parse import quote

base = "https://thehillz.xyz/music/"
os.makedirs("music", exist_ok=True)

tracks = [
"3.5_spotdown.org.mp3",
"3s A Crowd_spotdown.org.mp3",
"4 Raws_spotdown.org.mp3",
"901 Freestyle_spotdown.org.mp3",
"All Star_spotdown.org.mp3",
"An Eater_spotdown.org.mp3",
"Bad_spotdown.org.mp3",
"Bean (Kobe) [feat. Chief Keef]_spotdown.org.mp3",
"Bleed_spotdown.org.mp3",
"Blonde_spotdown.org.mp3",
"Boosted_spotdown.org.mp3",
"Boys Don't Cry_spotdown.org.mp3",
"Clint Eastwood_spotdown.org.mp3",
"David_spotdown.org.mp3",
"Dog_spotdown.org.mp3",
"EAT MY D_spotdown.org.mp3",
"Flexing All Summer_spotdown.org.mp3",
"Freestyle_spotdown.org.mp3",
"Gemstone_spotdown.org.mp3",
"Get out my way_spotdown.org.mp3",
"Goose Creek_spotdown.org.mp3",
"Habits_spotdown.org.mp3",
"Its A Party_spotdown.org.mp3",
"LIT EFFECT [Feat. Bktherula & LAZER DIM 700]_spotdown.org.mp3",
"Laced max_spotdown.org.mp3",
"Lemonade_spotdown.org.mp3",
"Light_spotdown.org.mp3",
"Loco_spotdown.org.mp3",
"Made Sum Plans_spotdown.org.mp3",
"Maui Wowie_spotdown.org.mp3",
"Money_spotdown.org.mp3",
"NORMAL_spotdown.org.mp3",
"One_spotdown.org.mp3",
"Paris_spotdown.org.mp3",
"Rendezvous (feat. Yeat)_spotdown.org.mp3",
"Rich in Rome (feat. LAZER DIM 700 & Nino Paid)_spotdown.org.mp3",
"Rot_spotdown.org.mp3",
"STAY HERE 4 LIFE (feat. Brent Faiyaz)_spotdown.org.mp3",
"Under Your Spell_spotdown.org.mp3",
"Unslept_spotdown.org.mp3",
"VYZEE_spotdown.org.mp3",
"Vogue_spotdown.org.mp3",
"WTM_spotdown.org.mp3",
"Which One (feat. Central Cee)_spotdown.org.mp3",
"Wonderful Time_spotdown.org.mp3",
"Your Dreams_spotdown.org.mp3",
"addition_spotdown.org.mp3",
"agenda_spotdown.org.mp3",
"asa mitaka_spotdown.org.mp3",
"blood_spotdown.org.mp3",
"glitter ✩‧₊˚_spotdown.org.mp3",
"jus yr doll_spotdown.org.mp3",
"just score it_spotdown.org.mp3",
"needless_spotdown.org.mp3",
"ok im cool_spotdown.org.mp3",
"regretful_spotdown.org.mp3"
]

for track in tracks:
    url = base + quote(track)
    path = os.path.join("music", track)

    r = requests.get(url)
    if r.status_code == 200:
        with open(path, "wb") as f:
            f.write(r.content)
        print("Downloaded:", track)
    else:
        print("Missing:", track)