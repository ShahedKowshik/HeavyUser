
import React, { useState, useMemo } from 'react';
import { X, Flame, Check, ChevronLeft, ChevronRight, Activity, Plus, Trash2, Smile, Ban, Target, Minus, Edit2, RotateCcw, ArrowLeft, Trophy, TrendingUp, Calendar, Ruler, Search } from 'lucide-react';
import { Habit } from '../types';
import { supabase } from '../lib/supabase';
import { encryptData } from '../lib/crypto';

interface HabitSectionProps {
  habits: Habit[];
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>;
  userId: string;
  dayStartHour?: number;
  onHabitComplete?: () => void;
}

// Helper to build emoji objects with tags
const mk = (icons: string[], tags: string) => icons.map(icon => ({ icon, tags }));

// Expanded Emoji Library with Keywords for Search
const EMOJI_LIBRARY = [
  // --- FLUIDS & WEATHER ---
  ...mk(['💧','🚿','🛁'], 'water clean wash shower bath hygiene'),
  ...mk(['🌊'], 'water wave sea ocean swim'),
  ...mk(['🌧️','⛈️','🌩️'], 'rain storm weather lightning thunder'),
  ...mk(['☀️','🌤️','⛅'], 'sun sunny weather day morning'),
  ...mk(['☁️'], 'cloud weather overcast'),
  ...mk(['🌈'], 'rainbow weather color hope'),
  ...mk(['❄️','⛄'], 'snow cold winter ice snowman'),
  ...mk(['🔥','💥'], 'fire hot burn energy passion'),
  ...mk(['✨','⭐','🌟'], 'star sparkle shine magic success'),
  ...mk(['🌙','🌌'], 'moon night space evening sleep'),

  // --- FOOD: FRUITS ---
  ...mk(['🍏','🍎'], 'apple fruit food red green healthy'),
  ...mk(['🍐'], 'pear fruit food healthy'),
  ...mk(['🍊'], 'orange fruit food citrus vitamin'),
  ...mk(['🍋'], 'lemon fruit food citrus sour'),
  ...mk(['🍌'], 'banana fruit food yellow potassium'),
  ...mk(['🍉'], 'watermelon fruit food summer fresh'),
  ...mk(['🍇'], 'grape fruit food purple wine'),
  ...mk(['🍓'], 'strawberry fruit food red berry sweet'),
  ...mk(['🫐'], 'blueberry fruit food berry superfood'),
  ...mk(['🍒'], 'cherry fruit food red sweet'),
  ...mk(['🍑'], 'peach fruit food sweet'),
  ...mk(['🥭'], 'mango fruit food tropical'),
  ...mk(['🍍'], 'pineapple fruit food tropical'),
  ...mk(['🥥'], 'coconut fruit food tropical oil'),
  ...mk(['🥝'], 'kiwi fruit food green'),
  
  // --- FOOD: VEGETABLES ---
  ...mk(['🍅'], 'tomato vegetable food red'),
  ...mk(['🥑'], 'avocado vegetable food green healthy fat keto'),
  ...mk(['🥦'], 'broccoli vegetable food green healthy iron'),
  ...mk(['🥬'], 'leafy green vegetable food salad spinach kale'),
  ...mk(['🥒'], 'cucumber vegetable food green salad'),
  ...mk(['🌶️','🫑'], 'pepper vegetable food spicy hot chili bell'),
  ...mk(['🌽'], 'corn vegetable food yellow'),
  ...mk(['🥕'], 'carrot vegetable food orange vision'),
  ...mk(['🥔'], 'potato vegetable food carb starch'),
  ...mk(['🍆'], 'eggplant vegetable food purple'),
  ...mk(['🧅','🧄'], 'onion garlic vegetable food flavor cook'),
  ...mk(['🍄'], 'mushroom vegetable food fungus'),
  ...mk(['🥜','🌰'], 'nut peanut chestnut food protein snack'),

  // --- FOOD: MEALS & JUNK ---
  ...mk(['🍞','🥐','🥖','🥯'], 'bread bakery food carb breakfast toast'),
  ...mk(['🥞','🧇'], 'pancake waffle breakfast food sweet'),
  ...mk(['🍳','🥚'], 'egg breakfast food protein cook'),
  ...mk(['🧀'], 'cheese food dairy keto'),
  ...mk(['🥩','🍗','🍖'], 'meat steak chicken beef protein dinner'),
  ...mk(['🥓'], 'bacon meat breakfast pork'),
  ...mk(['🍔'], 'burger hamburger food meat fast cheat'),
  ...mk(['🍟'], 'fries food fast potato cheat side'),
  ...mk(['🍕'], 'pizza food italian fast cheat dinner'),
  ...mk(['🌭'], 'hotdog food meat fast'),
  ...mk(['🥪'], 'sandwich food lunch bread'),
  ...mk(['🌮','🌯'], 'taco burrito food mexican dinner'),
  ...mk(['🥗'], 'salad healthy food diet green lunch'),
  ...mk(['🍿'], 'popcorn snack movie food'),
  ...mk(['🍜','🍝'], 'noodle pasta food italian asian dinner carb'),
  ...mk(['🍚','🍙','🍣','🍱','🍤'], 'rice sushi asian food japanese fish dinner'),
  ...mk(['🍦','🍧','🍨'], 'ice cream dessert sweet cold summer'),
  ...mk(['🍩','🍪','🎂','🍰','🧁','🥧'], 'cake cookie donut pie dessert sweet sugar cheat'),
  ...mk(['🍫','🍬','🍭'], 'chocolate candy sweet sugar snack'),

  // --- DRINKS ---
  ...mk(['🥛'], 'milk drink dairy calcium bone'),
  ...mk(['☕'], 'coffee drink caffeine morning energy work espresso'),
  ...mk(['🫖','🍵'], 'tea drink hot green herbal relax matcha'),
  ...mk(['🥤','🧃'], 'juice soda drink soft beverage'),
  ...mk(['🍺','🍻'], 'beer alcohol drink party pub bar'),
  ...mk(['🍷','🥂','🍾'], 'wine champagne alcohol drink celebrate fancy'),
  ...mk(['🥃','🍸','🍹'], 'cocktail whiskey alcohol drink party bar'),

  // --- SPORTS & FITNESS ---
  ...mk(['⚽'], 'soccer ball sport football match'),
  ...mk(['🏀'], 'basketball ball sport nba hoop'),
  ...mk(['🏈'], 'football ball sport american nfl'),
  ...mk(['⚾'], 'baseball ball sport mlb home run'),
  ...mk(['🥎'], 'softball ball sport'),
  ...mk(['🎾'], 'tennis ball sport court racket'),
  ...mk(['🏐'], 'volleyball ball sport beach'),
  ...mk(['🏉'], 'rugby ball sport scrum'),
  ...mk(['🥏'], 'frisbee sport park play'),
  ...mk(['🎱'], 'pool billiard ball sport snooker'),
  ...mk(['🏓'], 'ping pong table tennis sport paddle'),
  ...mk(['🏸'], 'badminton sport racket shuttlecock'),
  ...mk(['🏒','🥅'], 'hockey sport ice nhl goal puck'),
  ...mk(['🏏'], 'cricket sport bat ball match'),
  ...mk(['🏑'], 'field hockey sport stick ball'),
  ...mk(['🥍'], 'lacrosse sport stick'),
  ...mk(['⛳'], 'golf sport course hole'),
  ...mk(['🏹'], 'archery sport bow arrow target'),
  ...mk(['🎣'], 'fishing sport fish outdoors relax'),
  ...mk(['🥊'], 'boxing sport fight gloves gym cardio'),
  ...mk(['🥋'], 'martial arts karate judo sport fight uniform'),
  ...mk(['⛸️'], 'ice skate sport winter figure'),
  ...mk(['🎿','🏂'], 'ski snowboard sport winter snow mountain'),
  ...mk(['🛹'], 'skateboard sport skate park trick'),
  ...mk(['🛼'], 'roller skate sport fun'),
  ...mk(['🧗','🧗‍♀️','🧗‍♂️'], 'climb rock bouldering sport gym outdoor'),
  ...mk(['🏋️','🏋️‍♀️','🏋️‍♂️'], 'weight lift gym muscle strength fitness bodybuilding'),
  ...mk(['🤸','🤸‍♀️','🤸‍♂️'], 'gymnastics sport flexible flip'),
  ...mk(['🤺'], 'fencing sport sword fight'),
  ...mk(['🤼'], 'wrestling sport fight'),
  ...mk(['🏇'], 'horse riding racing sport animal'),
  ...mk(['🧘','🧘‍♀️','🧘‍♂️'], 'yoga meditate zen fitness stretch relax'),
  ...mk(['🏊','🏊‍♀️','🏊‍♂️'], 'swim water sport fitness pool lap'),
  ...mk(['🤽'], 'water polo sport swim team'),
  ...mk(['🚣'], 'rowing boat sport fitness cardio'),
  ...mk(['🚴','🚴‍♀️','🚴‍♂️'], 'bike cycle fitness cardio ride spin'),
  ...mk(['🚵'], 'mountain bike sport outdoor trail'),
  ...mk(['🏃','🏃‍♀️','🏃‍♂️'], 'run running jog fitness cardio marathon'),
  ...mk(['🚶','🚶‍♀️','🚶‍♂️'], 'walk steps hike fitness outdoor move'),

  // --- HOBBIES & ARTS ---
  ...mk(['🎨','🖌️'], 'art paint draw creative hobby palette brush'),
  ...mk(['🧵','🧶'], 'sew knit craft yarn needle hobby'),
  ...mk(['📸','📷'], 'photo camera picture photography hobby'),
  ...mk(['📹','🎥'], 'video film record movie create vlogging'),
  ...mk(['🎬'], 'movie cinema film watch director'),
  ...mk(['🎭'], 'theater drama act perform art'),
  ...mk(['🎪'], 'circus event show fun'),
  ...mk(['🎫','🎟️'], 'ticket event show concert'),
  ...mk(['🎹'], 'piano music instrument play keyboard'),
  ...mk(['🎸'], 'guitar music instrument play acoustic electric'),
  ...mk(['🎻'], 'violin music instrument play string'),
  ...mk(['🥁'], 'drum music instrument play beat band'),
  ...mk(['🎷'], 'saxophone music instrument play jazz'),
  ...mk(['🎺'], 'trumpet music instrument play brass'),
  ...mk(['🪗'], 'accordion music instrument play'),
  ...mk(['🎤'], 'sing song karaoke voice music record'),
  ...mk(['🎧'], 'listen music podcast audio sound'),
  ...mk(['🎮','🕹️'], 'game gaming play console controller video'),
  ...mk(['🎲'], 'dice game board luck play'),
  ...mk(['♟️'], 'chess game strategy board play'),
  ...mk(['🧩'], 'puzzle game solve logic brain'),
  ...mk(['🎳'], 'bowling sport game ball pins'),
  ...mk(['🎯'], 'darts target game bullseye focus'),

  // --- ACADEMIC & WORK ---
  ...mk(['📚','📖'], 'book read study learn school library education'),
  ...mk(['📝','✍️'], 'write journal note pencil pen paper author'),
  ...mk(['🎓'], 'graduate school degree learn success cap'),
  ...mk(['🎒'], 'backpack school student travel hike'),
  ...mk(['💻','🖥️'], 'computer laptop pc work code tech program dev'),
  ...mk(['⌨️','🖱️'], 'keyboard mouse tech work office'),
  ...mk(['💼'], 'briefcase work business job office career'),
  ...mk(['📁','📂'], 'file folder organize office work data'),
  ...mk(['📅','📆'], 'calendar date schedule plan deadline'),
  ...mk(['📈','📉','📊'], 'chart graph stats analysis business finance stock'),
  ...mk(['🔬','⚗️','🧬'], 'science biology chemistry experiment lab research'),
  ...mk(['🔭'], 'telescope space astronomy star look'),
  ...mk(['📡'], 'satellite tech signal comms'),
  ...mk(['💡'], 'idea light bulb smart innovate think'),
  ...mk(['🧠'], 'brain think mind smart learn memory'),
  ...mk(['💰','💵','💳'], 'money cash dollar credit card finance save spend wealth'),
  ...mk(['💎'], 'diamond gem wealth expensive jewelry'),
  ...mk(['⚖️'], 'scale balance law justice judge weigh'),
  ...mk(['🔨','🔧','🪛','🛠️'], 'tool fix build repair diy hammer wrench'),
  ...mk(['🧱'], 'brick build construct wall foundation'),
  ...mk(['⚙️'], 'gear setting mechanic engineer work system'),

  // --- HOUSE & CHORES ---
  ...mk(['🏠','🏡'], 'house home building live family'),
  ...mk(['🛌','🛏️'], 'bed sleep rest nap furniture room'),
  ...mk(['🛋️','🪑'], 'couch chair sit relax furniture room'),
  ...mk(['🚪'], 'door open close enter exit'),
  ...mk(['🗝️','🔑'], 'key lock open access secure'),
  ...mk(['🧹'], 'broom clean sweep chore dust'),
  ...mk(['🧽','🧼'], 'sponge soap clean wash scrub chore'),
  ...mk(['🧺'], 'laundry basket clothes wash chore'),
  ...mk(['🧻'], 'toilet paper bathroom hygiene supply'),
  ...mk(['🛒'], 'shop cart buy store grocery'),
  ...mk(['🎁'], 'gift present give birthday surprise'),
  ...mk(['🎈'], 'balloon party celebrate fun'),
  ...mk(['📧','📨','📩'], 'email mail message send receive work'),
  ...mk(['📦'], 'package box delivery ship order'),
  ...mk(['📮','📪'], 'mailbox post send letter'),

  // --- HEALTH & MEDICAL ---
  ...mk(['💊'], 'pill medicine vitamin health sick cure'),
  ...mk(['💉'], 'shot vaccine doctor nurse health blood'),
  ...mk(['🩹'], 'bandage heal hurt fix health first aid'),
  ...mk(['🩺'], 'stethoscope doctor health medical checkup'),
  ...mk(['🩸'], 'blood drop health donation medical'),
  ...mk(['🦠'], 'germ virus bacteria sick illness'),
  ...mk(['🦷'], 'tooth dentist health hygiene clean smile'),
  ...mk(['🦴'], 'bone health skeleton dog'),
  ...mk(['👀','👁️'], 'eye see watch vision look'),
  ...mk(['👂'], 'ear listen hear sound audio'),
  ...mk(['👃'], 'nose smell scent breathe'),
  ...mk(['👅'], 'tongue taste lick mouth'),
  ...mk(['🦵','🦶'], 'leg foot body walk run step'),
  ...mk(['💪'], 'muscle arm strength flex gym strong'),
  ...mk(['🫀'], 'heart organ anatomy health pulse cardio'),
  ...mk(['🫁'], 'lungs breath health air oxygen'),

  // --- ANIMALS & NATURE ---
  ...mk(['🐶','🐕','🦮'], 'dog puppy pet animal loyal walk friend'),
  ...mk(['🐱','🐈'], 'cat kitten pet animal meow purr'),
  ...mk(['🐭','🐹','🐰'], 'mouse hamster rabbit pet animal small cute'),
  ...mk(['🦊','🐻','🐼','🐨'], 'fox bear panda koala wild animal zoo'),
  ...mk(['🦁','🐯'], 'lion tiger wild animal cat big predator'),
  ...mk(['🐮','🐷','🐴'], 'cow pig horse farm animal milk ride'),
  ...mk(['🐑','🐐'], 'sheep goat farm animal wool'),
  ...mk(['🐔','🐥','🦆','🦅','🦉','🐧'], 'bird chicken duck eagle owl penguin animal fly wing'),
  ...mk(['🐸'], 'frog animal amphibian green jump'),
  ...mk(['🐢','🐍','🦎'], 'reptile turtle snake lizard animal cold'),
  ...mk(['🐳','🐬','🦈','🐠','🐟'], 'sea ocean fish whale dolphin shark animal swim'),
  ...mk(['🐙','🦑','🦀','🦞','🦐'], 'sea ocean octopus squid crab lobster shrimp food'),
  ...mk(['🐌','🦋','🐛','🐜','🐝','🐞'], 'insect bug snail butterfly caterpillar ant bee ladybug garden nature'),
  ...mk(['🦂','🕷️'], 'insect bug scorpion spider scary'),
  ...mk(['🦕','🦖'], 'dinosaur ancient extinct'),
  ...mk(['🌵','🌴','🌲','🌳'], 'plant tree nature forest garden desert green'),
  ...mk(['🌱','🌿','☘️','🍀'], 'plant leaf herb nature grow lucky garden'),
  ...mk(['🍁','🍂','🍃'], 'leaf fall autumn nature wind'),
  ...mk(['💐','🌷','🌹','🥀','🌺','🌸','🌼','🌻'], 'flower nature garden bloom bouquet smell pretty'),

  // --- TRANSPORT & TRAVEL ---
  ...mk(['🚗','🚘','🚙'], 'car drive vehicle auto transport road trip'),
  ...mk(['🚕'], 'taxi car vehicle transport city'),
  ...mk(['🚌','🚍'], 'bus vehicle transport public school'),
  ...mk(['🚓','🚑','🚒'], 'police ambulance fire emergency vehicle help'),
  ...mk(['🏎️'], 'race car sport speed fast f1'),
  ...mk(['🏍️','🛵'], 'motorcycle scooter vehicle bike ride fast'),
  ...mk(['🚲'], 'bike bicycle vehicle cycle ride pedal'),
  ...mk(['🚂','🚆','🚇','🚅'], 'train subway metro travel transport commute rail'),
  ...mk(['✈️','🛫','🛬'], 'plane fly travel flight vehicle airport vacation'),
  ...mk(['🚀'], 'rocket space travel launch fast future'),
  ...mk(['🛸'], 'ufo space alien fly mystery'),
  ...mk(['🚁'], 'helicopter fly travel air vehicle'),
  ...mk(['🛶','⛵','🚤','🛳️','⛴️','🚢'], 'boat ship sea ocean water travel cruise'),
  ...mk(['⚓'], 'anchor sea boat navy symbol'),
  ...mk(['🚧','🚦','🛑'], 'stop traffic sign road construction wait'),
  ...mk(['🗺️','🌍','🌎','🌏'], 'map world earth globe travel location planet'),

  // --- OBJECTS & CLOTHING ---
  ...mk(['⌚'], 'watch time clock wrist wearable'),
  ...mk(['📱','📲'], 'phone mobile tech call app social'),
  ...mk(['🔋','🔌'], 'battery power energy charge tech'),
  ...mk(['🔔'], 'bell notification alert sound ring'),
  ...mk(['🕶️','👓'], 'glasses sunglasses vision cool accessory'),
  ...mk(['👔','👕','👖','👗'], 'clothes shirt pants dress fashion wear work'),
  ...mk(['👘','🥻'], 'clothes cultural fashion wear'),
  ...mk(['👙','🩱'], 'swimsuit swim beach pool wear'),
  ...mk(['👛','👜','🎒'], 'bag purse fashion carry'),
  ...mk(['👞','👟','🥾','👠','👡','👢'], 'shoe sneaker boot heel fashion walk run wear'),
  ...mk(['👑'], 'crown king queen royal success leader'),
  ...mk(['💍'], 'ring jewelry marry engage rich'),
  ...mk(['💄'], 'lipstick makeup beauty face'),

  // --- EMOTIONS & SYMBOLS ---
  ...mk(['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎'], 'heart love color symbol emotion feeling'),
  ...mk(['💔'], 'broken heart sad love break pain'),
  ...mk(['❣️','💕','💞','💓','💗','💖','💘','💝'], 'heart love decoration symbol romance'),
  ...mk(['☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️'], 'symbol religion peace faith spirit'),
  ...mk(['😀','😃','😄','😁','😆','😊'], 'smile happy face emotion laugh joy'),
  ...mk(['😂','🤣'], 'laugh face emotion funny lol'),
  ...mk(['🙂','🙃','😉'], 'smile wink face emotion friendly'),
  ...mk(['🥰','😍','🤩'], 'love eye face emotion adore star'),
  ...mk(['😘','😗','😙','😚'], 'kiss face emotion love'),
  ...mk(['😋','😛','😜','🤪'], 'tongue face emotion silly crazy yum'),
  ...mk(['😎'], 'cool sunglasses face emotion swag'),
  ...mk(['🤓'], 'nerd face emotion smart study glasses'),
  ...mk(['🤔','🧐'], 'think thinking face emotion curious smart'),
  ...mk(['😐','😑','😶'], 'neutral face emotion silent blank'),
  ...mk(['🙄'], 'roll eyes face emotion annoyed'),
  ...mk(['😏'], 'smirk face emotion confident'),
  ...mk(['😣','😥','😮','😯','😫','😴'], 'tired sleep face emotion surprise exhaust'),
  ...mk(['😭','😢','😞','😔'], 'cry sad face emotion tear upset'),
  ...mk(['😤','😠','😡','🤬'], 'angry mad face emotion rage furious'),
  ...mk(['🤯'], 'mind blown face emotion shock wow'),
  ...mk(['😳','🥵','🥶'], 'face emotion hot cold flush shock'),
  ...mk(['😱','😨','😰'], 'fear face emotion scared scream shock'),
  ...mk(['🤢','🤮'], 'sick face emotion vomit ill green'),
  ...mk(['🤧','😷','🤒','🤕'], 'sick face emotion mask ill hurt'),
  ...mk(['😇'], 'angel face emotion good innocent'),
  ...mk(['😈','👿'], 'devil face emotion bad evil'),
  ...mk(['👻','💀','☠️'], 'ghost skull dead death scary halloween'),
  ...mk(['💩'], 'poop face funny crap'),
  ...mk(['🤡','👹','👺'], 'clown monster mask face scary funny'),
  ...mk(['👽','🤖'], 'alien robot space tech face'),
  ...mk(['👍','👎'], 'thumbs up down yes no hand vote'),
  ...mk(['👋'], 'wave hand hello bye greet'),
  ...mk(['✌️','🤞'], 'peace luck hand fingers crossed'),
  ...mk(['🤟','🤘'], 'rock love hand sign'),
  ...mk(['👌'], 'ok hand perfect good'),
  ...mk(['🤏'], 'pinch hand small little'),
  ...mk(['👈','👉','👆','👇','☝️'], 'point hand finger direction'),
  ...mk(['👊','🤛','🤜'], 'fist hand punch bump fight'),
  ...mk(['👏','🙌','👐','🤲'], 'clap hand praise celebrate open'),
  ...mk(['🤝'], 'shake hand deal agree partner'),
  ...mk(['🙏'], 'pray hand hope thank please'),
  ...mk(['💅'], 'nail polish hand beauty sass'),
  ...mk(['✅','✔️','☑️'], 'check done tick symbol success'),
  ...mk(['❌','✖️','🚫','🛑'], 'cross wrong x symbol stop ban'),
  ...mk(['❓','❗','‼️'], 'question exclamation mark symbol ask important'),
  ...mk(['💯'], '100 score perfect symbol'),
  ...mk(['💤'], 'sleep zzz symbol rest'),
  ...mk(['🎵','🎶'], 'music note symbol sound song'),
];

const HabitSection: React.FC<HabitSectionProps> = ({ habits, setHabits, userId, dayStartHour, onHabitComplete }) => {
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingDay, setEditingDay] = useState<string | null>(null);
  
  // Form State (Shared for Create & Edit)
  const [formTitle, setFormTitle] = useState('');
  const [formIcon, setFormIcon] = useState(EMOJI_LIBRARY[0].icon);
  const [formTarget, setFormTarget] = useState<number>(1);
  const [formUnit, setFormUnit] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formUseCounter, setFormUseCounter] = useState(true);
  
  // Search State
  const [iconSearch, setIconSearch] = useState('');

  // Helper: Get Local ISO-like Date string (YYYY-MM-DD)
  const getLocalDateKey = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper: Get Logical Today Date String
  const getLogicalDateStr = () => {
    const d = new Date();
    if (d.getHours() < (dayStartHour || 0)) {
      d.setDate(d.getDate() - 1);
    }
    return getLocalDateKey(d);
  };

  // Helper: Format date friendly
  const formatDateFriendly = (dateStr: string) => {
    // Treat the date string as local time midnight to avoid timezone shifts
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const openCreateModal = () => {
    setFormTitle('');
    setFormIcon(EMOJI_LIBRARY[0].icon);
    setFormTarget(1);
    setFormUnit('');
    setFormStartDate(getLogicalDateStr());
    setFormUseCounter(true);
    setIconSearch('');
    setIsCreateModalOpen(true);
  };

  const openEditModal = (habit: Habit) => {
    setFormTitle(habit.title);
    setFormIcon(habit.icon);
    setFormTarget(habit.target);
    setFormUnit(habit.unit || '');
    setFormStartDate(habit.startDate);
    setFormUseCounter(habit.useCounter);
    setIconSearch('');
    setIsEditModalOpen(true);
  };

  const filteredIcons = useMemo(() => {
    if (!iconSearch.trim()) return EMOJI_LIBRARY;
    const lower = iconSearch.toLowerCase();
    // Strict match logic: Tag must contain the term, or icon must be the term.
    // Using simple includes allows "apple" to match "apple fruit".
    return EMOJI_LIBRARY.filter(e => e.tags.includes(lower) || e.icon.includes(lower));
  }, [iconSearch]);

  // Helper: Get last 7 days array for the card view based on logical today
  const getLast7Days = () => {
    const logicalToday = new Date();
    if (logicalToday.getHours() < (dayStartHour || 0)) {
        logicalToday.setDate(logicalToday.getDate() - 1);
    }

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(logicalToday);
      d.setDate(d.getDate() - (6 - i));
      return getLocalDateKey(d);
    });
  };

  // Helper: Calculate streak using logical date
  const calculateStreak = (habit: Habit) => {
    let streak = 0;
    const today = getLogicalDateStr();
    
    // We iterate backwards from today
    // Construct check date from today string
    const [y, m, d] = today.split('-').map(Number);
    let currentCheck = new Date(y, m - 1, d);
    let dateStr = today;
    
    let safety = 0;
    while (safety < 3650) { 
      safety++;
      if (dateStr < habit.startDate) break;

      const count = habit.progress[dateStr] || 0;
      const isSkipped = habit.skippedDates.includes(dateStr);
      const isMet = count >= habit.target;
      
      if (isMet) {
        streak++;
      } else if (isSkipped) {
        // Skipped days maintain streak bridge but don't add to count
      } else {
        if (dateStr === today && streak === 0) {
            // Allow 0 for today if not done yet
        } else {
            break; 
        }
      }
      
      currentCheck.setDate(currentCheck.getDate() - 1);
      dateStr = getLocalDateKey(currentCheck);
    }
    return streak;
  };

  // Helper: Calculate Longest Streak
  const calculateLongestStreak = (habit: Habit) => {
    let maxStreak = 0;
    let currentStreak = 0;
    
    // Logic ends at logical today
    const endStr = getLogicalDateStr();
    let currentStr = habit.startDate;

    while (currentStr <= endStr) {
        const count = habit.progress[currentStr] || 0;
        const isMet = count >= habit.target;
        const isSkipped = habit.skippedDates.includes(currentStr);

        if (isMet) {
            currentStreak++;
        } else if (!isSkipped) {
            maxStreak = Math.max(maxStreak, currentStreak);
            currentStreak = 0;
        }

        const parts = currentStr.split('-').map(Number);
        const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
        dateObj.setDate(dateObj.getDate() + 1);
        currentStr = getLocalDateKey(dateObj);
        
        if (currentStr > endStr) break;
    }
    
    return Math.max(maxStreak, currentStreak);
  };

  const incrementCount = async (habitId: string, date: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;

    if (date < habit.startDate) return;

    const currentCount = habit.progress[date] || 0;
    const isSkipped = habit.skippedDates.includes(date);
    let newSkipped = habit.skippedDates;
    let newCount = currentCount;

    if (habit.useCounter) {
        newCount = currentCount + 1;
    } else {
        newCount = currentCount >= habit.target ? 0 : habit.target;
    }

    if (isSkipped) {
      newSkipped = habit.skippedDates.filter(d => d !== date);
      newCount = habit.useCounter ? 1 : habit.target; 
    }

    const newProgress = { ...habit.progress, [date]: newCount };
    setHabits(prev => prev.map(h => h.id === habitId ? { ...h, progress: newProgress, skippedDates: newSkipped } : h));

    // Celebration Trigger
    if (newCount >= habit.target && onHabitComplete) {
       onHabitComplete();
    } else if (newCount > currentCount && onHabitComplete) {
       onHabitComplete();
    }

    await supabase.from('habits').update({ progress: newProgress, skipped_dates: newSkipped }).eq('id', habitId);
  };

  const updateDayStatus = async (habitId: string, date: string, count: number, skipped: boolean) => {
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;

    const newProgress = { ...habit.progress, [date]: count };
    let newSkipped = habit.skippedDates;
    
    if (skipped) {
        if (!newSkipped.includes(date)) newSkipped = [...newSkipped, date];
    } else {
        newSkipped = newSkipped.filter(d => d !== date);
    }
    
    // Trigger celebration if manually setting to complete
    if (count >= habit.target && onHabitComplete) {
       onHabitComplete();
    }

    setHabits(prev => prev.map(h => h.id === habitId ? { ...h, progress: newProgress, skippedDates: newSkipped } : h));
    await supabase.from('habits').update({ progress: newProgress, skipped_dates: newSkipped }).eq('id', habitId);
  };

  const handleSaveHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;
    const finalTarget = formUseCounter ? formTarget : 1;

    if (isEditModalOpen && selectedHabitId) {
       setHabits(prev => prev.map(h => h.id === selectedHabitId ? {
         ...h,
         title: formTitle,
         icon: formIcon,
         target: finalTarget,
         unit: formUnit,
         startDate: formStartDate,
         useCounter: formUseCounter
       } : h));

       await supabase.from('habits').update({
         title: encryptData(formTitle), // Encrypt Title
         icon: formIcon,
         target: finalTarget,
         unit: formUnit,
         start_date: formStartDate,
         use_counter: formUseCounter
       }).eq('id', selectedHabitId);
       setIsEditModalOpen(false);
    } else {
       const newHabit: Habit = {
        id: crypto.randomUUID(),
        title: formTitle.trim(),
        icon: formIcon,
        target: finalTarget,
        unit: formUnit,
        startDate: formStartDate,
        useCounter: formUseCounter,
        progress: {},
        skippedDates: [],
        completedDates: []
      };
      setHabits(prev => [...prev, newHabit]);
      setIsCreateModalOpen(false);
      await supabase.from('habits').insert({
        id: newHabit.id,
        user_id: userId,
        title: encryptData(newHabit.title), // Encrypt Title
        icon: newHabit.icon,
        target: newHabit.target,
        unit: newHabit.unit,
        start_date: newHabit.startDate,
        use_counter: newHabit.useCounter,
        progress: {},
        skipped_dates: []
      });
    }
  };

  const handleDeleteHabit = async (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    
    if (window.confirm('Are you sure you want to delete this habit permanently?')) {
      // Optimistic Update
      setHabits(prev => prev.filter(h => h.id !== id));
      setSelectedHabitId(null);
      
      try {
        const { error } = await supabase
          .from('habits')
          .delete()
          .eq('id', id)
          .eq('user_id', userId); // Explicitly match user_id for RLS safety

        if (error) {
          throw error;
        }
      } catch (err) {
        console.error("Error deleting habit:", err);
        alert("Failed to delete habit from the server. Please refresh.");
      }
    }
  };

  const selectedHabit = useMemo(() => habits.find(h => h.id === selectedHabitId), [habits, selectedHabitId]);

  // Determine "Today" for Calendar display purposes based on Logical Date
  const logicalTodayDate = useMemo(() => {
      const d = new Date();
      if (d.getHours() < (dayStartHour || 0)) {
          d.setDate(d.getDate() - 1);
      }
      return d;
  }, [dayStartHour]);

  const daysInMonth = new Date(logicalTodayDate.getFullYear(), logicalTodayDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(logicalTodayDate.getFullYear(), logicalTodayDate.getMonth(), 1).getDay();

  // --- Statistics Calculation (Single Habit) ---
  const getHabitStats = (habit: Habit) => {
    const streak = calculateStreak(habit);
    const longestStreak = calculateLongestStreak(habit);
    const totalMetDays = Object.entries(habit.progress).filter(([_, count]) => count >= habit.target).length;
    const totalSkips = habit.skippedDates.length;
    const startDateObj = new Date(habit.startDate);
    const daysSinceStart = Math.max(1, Math.floor((new Date().getTime() - startDateObj.getTime()) / (1000 * 3600 * 24)) + 1);
    const totalEffectiveDays = Math.max(1, daysSinceStart - totalSkips);
    const efficiency = Math.round((totalMetDays / totalEffectiveDays) * 100);

    return { totalMetDays, streak, longestStreak, efficiency, totalSkips };
  };

  // Vibrant Color Logic
  const getStatusColor = (habit: Habit, date: string) => {
    const count = habit.progress[date] || 0;
    const isSkipped = habit.skippedDates.includes(date);
    const todayStr = getLogicalDateStr();
    const isToday = date === todayStr;
    const isFuture = date > todayStr;
    const isBeforeStart = date < habit.startDate;

    if (isBeforeStart) return 'bg-slate-50 text-slate-300 border-transparent cursor-default opacity-40'; 
    if (isFuture) return 'bg-white text-slate-200 border-slate-100'; 
    if (isSkipped) return 'bg-slate-100 text-slate-500 border-slate-200'; // Skipped = Neutral Gray
    if (count >= habit.target) return 'bg-emerald-500 text-white border-emerald-500 shadow-sm'; // Met = Vibrant Emerald
    if (count > 0 && count < habit.target) return 'bg-amber-100 text-amber-700 border-amber-200'; // Partial = Amber
    if (isToday) return 'bg-white text-slate-600 border-blue-400 ring-2 ring-blue-100'; // Today = Blue outline
    return 'bg-rose-50 text-rose-500 border-rose-100'; // Missed = Rose
  };

  return (
    <div className="animate-in fade-in duration-500 pb-20">
      {selectedHabit ? (
        // --- Dedicated Detail View ---
        <div className="animate-in slide-in-from-right duration-300">
          <div className="mb-6 flex items-center justify-between">
            <button 
              type="button"
              onClick={() => setSelectedHabitId(null)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded hover:bg-slate-50 transition-all font-bold text-sm shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Habits
            </button>
            <div className="flex items-center gap-2">
              <button 
                type="button"
                onClick={() => openEditModal(selectedHabit)} 
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded transition-colors shadow-sm font-bold text-sm" 
                title="Edit Habit"
              >
                <Edit2 className="w-4 h-4" />
                <span className="hidden sm:inline">Edit Habit</span>
              </button>
              <button 
                type="button"
                onClick={(e) => handleDeleteHabit(selectedHabit.id, e)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-red-100 text-[#a4262c] hover:bg-red-50 rounded transition-colors shadow-sm font-bold text-sm"
                title="Delete Habit"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            </div>
          </div>

          {/* Habit Title Header */}
          <div className="bg-white rounded border border-slate-200 p-6 mb-6 flex flex-col md:flex-row items-start md:items-center gap-6 shadow-sm border-l-4 border-l-blue-500">
            <div className="w-16 h-16 bg-blue-50 rounded flex items-center justify-center text-4xl shadow-inner border border-blue-100">
              {selectedHabit.icon}
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-black text-slate-800 tracking-tight mb-1">{selectedHabit.title}</h2>
              <div className="flex flex-wrap gap-4 text-xs font-medium text-slate-600">
                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 rounded">
                  <Target className="w-3.5 h-3.5 text-[#0078d4]" />
                  {selectedHabit.useCounter 
                    ? `Goal: ${selectedHabit.target} ${selectedHabit.unit || 'count'}/day` 
                    : 'Daily Check-in'}
                </span>
                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 rounded">
                  <Calendar className="w-3.5 h-3.5 text-[#0078d4]" />
                  Started {formatDateFriendly(selectedHabit.startDate)}
                </span>
              </div>
            </div>
          </div>

          {/* Statistics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            {[
              { label: 'Current Streak', value: `${getHabitStats(selectedHabit).streak} Days`, icon: Flame, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
              { label: 'Longest Streak', value: `${getHabitStats(selectedHabit).longestStreak} Days`, icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
              { label: 'Total Completions', value: `${getHabitStats(selectedHabit).totalMetDays}`, icon: Trophy, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
              { label: 'Times Skipped', value: `${getHabitStats(selectedHabit).totalSkips}`, icon: Ban, color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200' },
              { label: 'Efficiency', value: `${getHabitStats(selectedHabit).efficiency}%`, icon: Activity, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
            ].map((stat, i) => (
              <div key={i} className={`bg-white border ${stat.border} p-4 rounded flex flex-col gap-2 relative overflow-hidden group hover:shadow-md transition-all shadow-sm`}>
                <div className={`absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity ${stat.color}`}>
                  <stat.icon className="w-12 h-12" />
                </div>
                <div className="z-10 flex flex-col h-full justify-between">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-6 h-6 rounded flex items-center justify-center ${stat.bg} ${stat.color}`}>
                      <stat.icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">{stat.label}</div>
                  </div>
                  <div className="text-2xl font-black text-slate-800 tracking-tight">{stat.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Calendar Section */}
          <div className="bg-white border border-slate-200 rounded overflow-hidden relative shadow-sm">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#0078d4]" />
                <span className="text-sm font-bold text-slate-800">
                  {logicalTodayDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </span>
              </div>
              <div className="flex gap-1">
                <button disabled className="p-1 text-slate-300 cursor-not-allowed"><ChevronLeft className="w-4 h-4" /></button>
                <button disabled className="p-1 text-slate-300 cursor-not-allowed"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="p-4 md:p-5">
              <div className="w-full md:max-w-2xl mx-auto">
                <div className="grid grid-cols-7 mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center text-[10px] font-black text-slate-400 uppercase py-2">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1 md:gap-2">
                  {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                    <div key={`empty-${i}`} className="aspect-square" />
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dateStr = `${logicalTodayDate.getFullYear()}-${String(logicalTodayDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const count = selectedHabit.progress[dateStr] || 0;
                    const todayStr = getLogicalDateStr();
                    const isFuture = dateStr > todayStr;
                    const isBeforeStart = dateStr < selectedHabit.startDate;
                    const statusClass = getStatusColor(selectedHabit, dateStr);

                    return (
                      <button
                        key={day}
                        disabled={isFuture || isBeforeStart}
                        onClick={() => setEditingDay(dateStr)}
                        className={`aspect-square rounded flex items-center justify-center text-sm font-semibold transition-all relative border ${statusClass} ${editingDay === dateStr ? 'ring-2 ring-offset-2 ring-[#0078d4] z-10' : ''}`}
                      >
                        {count >= selectedHabit.target ? <Check className="w-4 h-4" /> : (selectedHabit.useCounter && count > 0 ? count : (!isBeforeStart && !isFuture ? day : ''))}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {editingDay && (
              <div className="absolute inset-x-0 bottom-0 bg-white/95 backdrop-blur-md border-t border-slate-200 p-4 animate-in slide-in-from-bottom-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    Edit {formatDateFriendly(editingDay)}
                  </span>
                  <button onClick={() => setEditingDay(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded"><X className="w-3 h-3" /></button>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 flex-1 bg-slate-50 p-1 rounded">
                    {selectedHabit.useCounter ? (
                      <>
                        <button 
                          onClick={() => updateDayStatus(selectedHabit.id, editingDay, Math.max(0, (selectedHabit.progress[editingDay] || 0) - 1), false)}
                          className="w-8 h-8 flex items-center justify-center bg-white rounded text-slate-600 hover:text-[#0078d4] shadow-sm"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <div className="flex-1 text-center font-bold text-lg text-slate-800 flex items-center justify-center gap-1">
                          {selectedHabit.progress[editingDay] || 0}
                          <span className="text-xs text-slate-400 font-medium">/{selectedHabit.target}</span>
                          <span className="text-xs text-slate-600 font-normal">{selectedHabit.unit}</span>
                        </div>
                        <button 
                          onClick={() => updateDayStatus(selectedHabit.id, editingDay, (selectedHabit.progress[editingDay] || 0) + 1, false)}
                          className="w-8 h-8 flex items-center justify-center bg-white rounded text-slate-600 hover:text-[#0078d4] shadow-sm"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <button 
                         onClick={() => updateDayStatus(selectedHabit.id, editingDay, selectedHabit.progress[editingDay] ? 0 : 1, false)}
                         className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded font-bold transition-all shadow-sm ${selectedHabit.progress[editingDay] ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600'}`}
                      >
                         {selectedHabit.progress[editingDay] ? 'Completed' : 'Mark Complete'}
                      </button>
                    )}
                  </div>
                  {selectedHabit.useCounter && (
                    <button 
                       onClick={() => updateDayStatus(selectedHabit.id, editingDay, selectedHabit.target, false)}
                       className="p-2.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                       title="Achieve All"
                    >
                      <Target className="w-5 h-5" />
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      const isSkipped = selectedHabit.skippedDates.includes(editingDay);
                      updateDayStatus(selectedHabit.id, editingDay, 0, !isSkipped);
                    }}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded font-bold transition-colors ${selectedHabit.skippedDates.includes(editingDay) ? 'bg-slate-600 text-white hover:bg-slate-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    <Ban className="w-4 h-4" />
                    <span className="text-sm">{selectedHabit.skippedDates.includes(editingDay) ? 'Unskip Day' : 'Skip Day'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
          
           {/* Bottom Delete Button Removed */}
        </div>
      ) : (
        // --- List View (Default) ---
        <div className="animate-in fade-in duration-500">
          <div className="mb-8 flex items-center justify-between">
            {/* Header copy removed as per request */}
            <div className="flex-1"></div> 
            <div className="flex items-center gap-3 w-full md:w-auto">
              <button 
                onClick={openCreateModal}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 fluent-btn-primary rounded shadow-md active:scale-95 transition-transform text-sm font-bold"
              >
                <Plus className="w-4 h-4" />
                <span>New Habit</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {habits.length === 0 ? (
              <div className="col-span-full py-20 text-center border border-dashed border-slate-200 rounded">
                <div className="w-16 h-16 bg-[#eff6fc] rounded flex items-center justify-center mx-auto mb-4">
                  <Smile className="w-8 h-8 text-[#0078d4]" />
                </div>
                <h4 className="text-lg font-bold text-slate-800">No habits yet</h4>
                <p className="text-sm text-slate-500 mt-1">Start building your streak today.</p>
              </div>
            ) : (
              habits.map(habit => {
                const streak = calculateStreak(habit);
                const last7 = getLast7Days();
                const total = Object.values(habit.progress).filter(c => c >= habit.target).length;

                return (
                  <div 
                    key={habit.id}
                    onClick={() => { setSelectedHabitId(habit.id); setEditingDay(null); }}
                    className="bg-white rounded border border-slate-200 p-5 cursor-pointer hover:shadow-lg hover:border-blue-200 transition-all group flex flex-col justify-between min-h-[140px] hover:border-l-4 hover:border-l-blue-500 hover:pl-[1.2rem]"
                  >
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-10 h-10 bg-blue-50 rounded flex items-center justify-center text-xl shadow-sm border border-blue-100 group-hover:scale-110 transition-transform relative">
                        {habit.icon}
                        {habit.useCounter && habit.target > 1 && (
                          <div className="absolute -bottom-1 -right-1 bg-[#0078d4] text-white text-[9px] font-bold px-1.5 rounded border border-white">
                            {habit.target}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-base font-bold text-slate-800 truncate">{habit.title}</h4>
                         {/* UNIT DISPLAY IN LIST VIEW */}
                         {habit.useCounter && (
                            <div className="text-xs text-slate-500 font-medium mt-0.5">
                                Goal: {habit.target} {habit.unit || 'count'} / day
                            </div>
                         )}
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded">
                            <Trophy className="w-3 h-3 text-[#d83b01]" /> {total}
                          </span>
                          {streak > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                              <Flame className="w-3 h-3 fill-current" /> {streak} Streak
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-auto pt-3 border-t border-slate-100">
                      <div className="flex justify-between items-center mb-1.5">
                         <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Last 7 Days</span>
                      </div>
                      <div className="flex justify-between gap-1">
                        {last7.map((date) => {
                          const count = habit.progress[date] || 0;
                          const statusClass = getStatusColor(habit, date);
                          const isBeforeStart = date < habit.startDate;
                          
                          return (
                            <div key={date} className="flex flex-col items-center gap-1">
                              <button 
                                type="button"
                                title={isBeforeStart ? "Not started yet" : `${date}: ${count} ${habit.unit || ''}/${habit.target}`}
                                onClick={(e) => incrementCount(habit.id, date, e)}
                                disabled={isBeforeStart}
                                className={`w-6 h-6 rounded flex items-center justify-center border transition-all text-[9px] font-bold ${statusClass}`}
                              >
                                {count >= habit.target ? <Check className="w-3.5 h-3.5" /> : (habit.useCounter && count > 0 ? count : '')}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Modal - Now accessible from both views */}
      {(isCreateModalOpen || isEditModalOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
           <div className="bg-white w-[95%] md:w-full max-w-md rounded shadow-2xl animate-in zoom-in duration-200 flex flex-col overflow-hidden max-h-[85vh]">
             <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-800 tracking-tight">{isEditModalOpen ? 'Edit Habit' : 'New Habit'}</h3>
              <button type="button" onClick={() => { setIsCreateModalOpen(false); setIsEditModalOpen(false); }} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveHabit} className="p-6 space-y-6 overflow-y-auto">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Habit Name</label>
                <input autoFocus required type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g., Drink Water" className="w-full text-sm font-semibold bg-slate-50 border-none rounded p-3 focus:ring-2 focus:ring-[#0078d4]/20" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Start Date</label>
                  <input type="date" required value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} className="w-full text-sm font-semibold bg-slate-50 border-none rounded p-3" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Goal Type</label>
                  <button 
                     type="button" 
                     onClick={() => setFormUseCounter(!formUseCounter)} 
                     className={`w-full text-sm font-bold p-3 rounded border transition-all flex items-center justify-center gap-2 ${formUseCounter ? 'bg-[#eff6fc] text-[#0078d4] border-[#0078d4]' : 'bg-slate-50 text-slate-600 border-transparent'}`}
                  >
                     {formUseCounter ? <RotateCcw className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                     {formUseCounter ? 'Counter' : 'Checkbox'}
                  </button>
                </div>
              </div>

              {formUseCounter && (
                <div className="space-y-1 animate-in fade-in slide-in-from-top-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Daily Target & Unit</label>
                  <div className="flex gap-4">
                     {/* Counter Section (50%) */}
                     <div className="flex items-center gap-1 bg-slate-50 rounded border border-transparent p-1 w-1/2">
                        <button type="button" onClick={() => setFormTarget(Math.max(1, formTarget - 1))} className="w-8 h-8 rounded bg-white shadow-sm flex items-center justify-center hover:bg-slate-100"><Minus className="w-3 h-3 text-slate-600" /></button>
                        <input 
                            type="number" 
                            min="1" 
                            value={formTarget} 
                            onChange={(e) => setFormTarget(parseInt(e.target.value) || 1)} 
                            className="flex-1 text-center text-lg font-bold bg-transparent border-none p-0 focus:ring-0 w-full"
                        />
                        <button type="button" onClick={() => setFormTarget(formTarget + 1)} className="w-8 h-8 rounded bg-white shadow-sm flex items-center justify-center hover:bg-slate-100"><Plus className="w-3 h-3 text-slate-600" /></button>
                     </div>
                     {/* Unit Section (50%) */}
                     <div className="w-1/2">
                        <div className="relative h-full">
                            <input 
                                type="text"
                                placeholder="Unit Name" 
                                value={formUnit}
                                onChange={e => setFormUnit(e.target.value)}
                                className="w-full h-full text-sm font-semibold bg-slate-50 border-none rounded p-3 pl-9 focus:ring-2 focus:ring-[#0078d4]/20"
                            />
                            <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        </div>
                     </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                 <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Icon</label>
                 </div>
                 
                 {/* Icon Search Input */}
                 <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Search icons..." 
                        value={iconSearch}
                        onChange={(e) => setIconSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-[#0078d4] placeholder:text-slate-400"
                    />
                 </div>

                 <div className="grid grid-cols-6 gap-2 max-h-40 overflow-y-auto p-1 custom-scrollbar">
                   {filteredIcons.map((item, idx) => (
                     <button
                      key={idx}
                      type="button"
                      onClick={() => setFormIcon(item.icon)}
                      className={`h-10 rounded flex items-center justify-center text-xl transition-all ${formIcon === item.icon ? 'bg-[#eff6fc] border border-[#0078d4] shadow-sm' : 'bg-slate-50 border border-transparent hover:bg-slate-100'}`}
                      title={item.tags}
                     >
                       {item.icon}
                     </button>
                   ))}
                   {filteredIcons.length === 0 && (
                       <div className="col-span-6 text-center py-4 text-xs text-slate-400 italic">
                           No icons found.
                       </div>
                   )}
                 </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => { setIsCreateModalOpen(false); setIsEditModalOpen(false); }} className="px-5 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded transition-colors">Cancel</button>
                <button type="submit" className="px-8 py-2 text-sm font-bold fluent-btn-primary rounded shadow-lg">{isEditModalOpen ? 'Save Changes' : 'Start Habit'}</button>
              </div>
            </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default HabitSection;
