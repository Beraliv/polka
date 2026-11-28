// The ten passages from Anna Karenina that every model experiment runs on. Keep
// them unchanged so results stay comparable across runs; see
// specs/model-experiment.md. The fact keys are what the judge checks answers
// against, so they state the speaker and scene the passage needs.

export type PassageFactKey = {
  speaker: string;
  listener: string;
  scene: string;
  notableWords: string[];
};

export type ExperimentPassage = {
  id: number;
  text: string;
  factKey: PassageFactKey;
};

export const EXPERIMENT_PASSAGES: ExperimentPassage[] = [
  {
    id: 1,
    text: '— Ты постой, постой, — сказал Степан Аркадьич, улыбаясь и трогая его руку. — Я тебе сказал то, что я знаю, и повторяю, что в этом тонком и нежном деле, сколько можно догадываться, мне кажется, шансы на твоей стороне.',
    factKey: {
      speaker: 'Stepan Arkadyich (Stiva) Oblonsky',
      listener: 'Konstantin Levin',
      scene: 'Moscow; Stiva reassures Levin before Levin proposes to Kitty',
      notableWords: ['тонком и нежном деле (delicate and tender matter)'],
    },
  },
  {
    id: 2,
    text: 'Кити замялась; она хотела далее сказать, что с тех пор, как с ней сделалась эта перемена, Степан Аркадьич ей стал невыносимо неприятен и что она не может видеть его без представлений самых грубых и безобразных.',
    factKey: {
      speaker: "narrator, in Kitty's thoughts",
      listener: 'none',
      scene: "Kitty, after her illness and Vronsky's rejection, finds Stiva repulsive",
      notableWords: ['безобразных (ugly, gross)'],
    },
  },
  {
    id: 3,
    text: '«Да вот и эта дама и другие тоже очень взволнованы; это очень натурально», сказал себе Алексей Александрович. Он хотел не смотреть на нее, но взгляд его невольно притягивался к ней. Он опять вглядывался в это лицо, стараясь не читать того, что так ясно было на нем написано, и против воли своей с ужасом читал на нем то, чего он не хотел знать.',
    factKey: {
      speaker: "narrator, in Karenin's thoughts",
      listener: 'none',
      scene: "Steeplechase races; Vronsky has just fallen, and Karenin watches Anna's agitation",
      notableWords: ['натурально (naturally, as a matter of course)'],
    },
  },
  {
    id: 4,
    text: '— Слишком большой контраст, — сказал он, — ехать после этого общества к старухе Вреде. И потом для нее вы будете случаем позлословить, а здесь вы только возбудите другие, самые хорошие и противоположные злословию чувства, — сказал он ей.',
    factKey: {
      speaker: 'Count Vronsky',
      listener: 'Anna Karenina',
      scene:
        "Princess Betsy Tverskaya's gathering in Petersburg; Vronsky persuades Anna not to visit Countess Vrede",
      notableWords: ['позлословить (to gossip maliciously)'],
    },
  },
  {
    id: 5,
    text: '— Если хорошенько разобрать историю этой девушки, то вы найдете, что эта девушка бросила семью, или свою, или сестрину, где бы она могла иметь женское дело, — неожиданно вступая в разговор, сказала с раздражительностью Дарья Александровна, вероятно догадываясь, какую девушку имел в виду Степан Аркадьич.',
    factKey: {
      speaker: 'Darya Alexandrovna (Dolly) Oblonskaya',
      listener: 'the dinner guests, including Stiva',
      scene:
        'A dinner-party debate on women working outside the home; Dolly suspects Stiva is speaking about a particular young woman',
      notableWords: ["женское дело (women's work, domestic duties)"],
    },
  },
  {
    id: 6,
    text: '— Вот, не угодно ли? — сказал он, вертлявою походкой отходя к стороне и указывая на картину. — Это увещание Пилатом. Матфея глава XXVII, — сказал он, чувствуя, что губы его начинают трястись от волнения. Он отошел и стал позади их.',
    factKey: {
      speaker: 'Mikhailov, the painter',
      listener: 'Anna Karenina and Count Vronsky',
      scene: "Mikhailov's studio in Italy; he shows his painting of Pilate admonishing Christ",
      notableWords: [
        "Увещание Пилатом (Pilate's Admonition)",
        'Матфея глава XXVII (Gospel of Matthew, chapter 27)',
      ],
    },
  },
  {
    id: 7,
    text: 'Быть женой такого человека, как Кознышев, после своего положения у госпожи Шталь представлялось ей верхом счастья. Кроме того, она почти была уверена, что она влюблена в него. И сейчас это должно было решиться. Ей страшно было. Страшно было и то, что он скажет, и то, что он не скажет.',
    factKey: {
      speaker: "narrator, in Varenka's thoughts",
      listener: 'none',
      scene:
        "Varenka, a former companion of Madame Stahl, expects Sergei Koznyshev to propose at Levin's estate",
      notableWords: ['госпожи Шталь (Madame Stahl)'],
    },
  },
  {
    id: 8,
    text: '— Он говорил о том, о чем я сама хочу говорить, и мне легко быть его адвокатом: о том, нет ли возможности и нельзя ли... — Дарья Александровна запнулась, — исправить, улучшить твое положение... Ты знаешь, как я смотрю... Но всё-таки, если возможно, надо выйти замуж...',
    factKey: {
      speaker: 'Darya Alexandrovna (Dolly) Oblonskaya',
      listener: 'Anna Karenina',
      scene:
        "Dolly visits Anna at Vronsky's estate and asks her to divorce Karenin and marry Vronsky",
      notableWords: ['адвокат (advocate, go-between)', 'выйти замуж (to marry)'],
    },
  },
  {
    id: 9,
    text: '— Ты, кажется, близок с Мордвинским; ты мне можешь оказать услугу, скажи ему, пожалуйста, за меня словечко. Есть место, которое бы я хотел занять. Членом агентства...',
    factKey: {
      speaker: 'Stepan Arkadyich (Stiva) Oblonsky',
      listener: 'Alexei Alexandrovich Karenin',
      scene: 'Stiva asks Karenin to put in a word with Mordvinsky for a post on a commission',
      notableWords: ['словечко (a word put in for someone)'],
    },
  },
  {
    id: 10,
    text: 'Но в ту же минуту, вернувшись к своему настроению, он с радостью почувствовал, что что-то новое и важное произошло в нем. Действительность только на время застилала то душевное спокойствие, которое он нашел; но оно было цело в нем.',
    factKey: {
      speaker: "narrator, in Levin's thoughts",
      listener: 'none',
      scene: 'Near the end of the novel, Levin feels inner peace after his spiritual awakening',
      notableWords: ['застилала (veiled, clouded)', 'было цело (remained intact)'],
    },
  },
];
