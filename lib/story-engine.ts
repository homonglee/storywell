export type Character = {
  id: string;
  name: string;
  role: string;
  archetype: string;
  desire: string;
  fear: string;
  secret: string;
  voice: string;
  state: string;
  color: string;
};

export type Episode = {
  number: number;
  title: string;
  stage: string;
  beat: string;
  emotion: string;
  hook: string;
  status: "planned" | "draft" | "done";
  words: number;
};

export type Foreshadow = {
  id: string;
  label: string;
  seedEpisode: number;
  payoffEpisode: number;
  status: "seeded" | "developing" | "planned";
  note: string;
};

export type StoryIdea = {
  title: string;
  source: string;
  span: string;
  reason: string;
  energy: "긴장" | "감정" | "반전" | "확장";
};

export type StoryMemory = {
  category: "인물" | "관계" | "사건" | "시간" | "장소" | "물건" | "정보" | "세계관";
  subject: string;
  fact: string;
  episode: number;
  confidence: number;
  locked: boolean;
};

export type ContinuityIssue = {
  severity: "오류" | "경고" | "확인";
  category: string;
  title: string;
  evidence: string;
  suggestion: string;
};

export type StoryContent = {
  logline: string;
  theme: string;
  worldRule: string;
  centralQuestion: string;
  endingPromise: string;
  characters: Character[];
  episodes: Episode[];
  foreshadows: Foreshadow[];
  ideas: StoryIdea[];
  manuscript: string;
  memories?: StoryMemory[];
  issues?: ContinuityIssue[];
  currentSummary?: string;
};

export type StoryProject = {
  id: string;
  title: string;
  synopsis: string;
  genre: string;
  tone: string;
  targetEpisodes: number;
  status: string;
  content: StoryContent;
  createdAt?: string;
  updatedAt?: string;
};

export type ProjectInput = Pick<
  StoryProject,
  "title" | "synopsis" | "genre" | "tone" | "targetEpisodes"
>;

const stageNames = [
  "낯선 균열",
  "첫 번째 선택",
  "관계의 결속",
  "적의 그림자",
  "대가의 시작",
  "숨겨진 진실",
  "돌이킬 수 없는 선",
  "가장 깊은 추락",
  "새로운 결심",
  "최종 충돌",
  "진실의 대가",
  "변화한 세계",
];

const titleSeeds = [
  "문이 열린 밤",
  "사라진 이름",
  "금지된 제안",
  "두 번째 목격자",
  "거짓말의 무게",
  "뜻밖의 동맹",
  "되돌아온 편지",
  "침묵하는 도시",
  "경계 너머",
  "배신의 온도",
  "남겨진 단서",
  "흔들리는 약속",
  "적의 얼굴",
  "가짜 승리",
  "검은 새벽",
  "마지막 열쇠",
];

const beatSeeds = [
  "주인공은 평범한 일상을 깨뜨리는 징후를 발견하고 외면할 수 없는 선택 앞에 선다.",
  "목표를 향한 첫 행동이 예상과 다른 결과를 낳으며 새로운 관계가 시작된다.",
  "조력자의 제안은 도움이 되지만 주인공이 감당하기 어려운 조건을 품고 있다.",
  "적대 세력의 움직임이 드러나고, 주인공이 믿었던 정보 하나가 흔들린다.",
  "작은 승리 뒤에 더 큰 대가가 따라오며 주인공의 약점이 노출된다.",
  "과거의 기록이 현재 사건과 연결되면서 처음의 가정이 뒤집힌다.",
  "주인공은 관계와 목표 중 하나를 선택해야 하며 양쪽 모두 상처를 입는다.",
  "계획이 무너지고 가장 가까운 사람이 등을 돌리며 주인공은 바닥까지 추락한다.",
  "숨겨왔던 결핍을 인정한 주인공이 이전과 다른 방식으로 다시 움직인다.",
  "각 인물의 욕망이 한 지점에서 충돌하고 오래된 복선이 연쇄적으로 작동한다.",
  "승리의 조건이 희생을 요구하며 주인공은 작품의 핵심 질문에 답한다.",
  "사건 이후 달라진 관계와 세계를 보여주고 다음 이야기의 문을 남긴다.",
];

const emotionSeeds = ["불안→결심", "호기심→경계", "신뢰→의심", "희망→위기", "분노→각성", "상실→재기"];

function cleanSynopsis(synopsis: string) {
  return synopsis.trim().replace(/\s+/g, " ");
}

function excerpt(synopsis: string, length = 72) {
  const clean = cleanSynopsis(synopsis);
  return clean.length > length ? clean.slice(0, length).trim() + "…" : clean;
}

export function buildStory(input: ProjectInput): StoryContent {
  const total = Math.max(12, Math.min(200, Number(input.targetEpisodes) || 80));
  const shortSynopsis = excerpt(input.synopsis);
  const arcSize = Math.max(1, Math.ceil(total / 12));

  const characters: Character[] = [
    {
      id: "lead",
      name: "서윤",
      role: "주인공",
      archetype: "상처 입은 관찰자",
      desire: "사건의 진실을 밝혀 자기 삶의 주도권을 되찾는다.",
      fear: "자신의 선택 때문에 소중한 사람을 다시 잃는 것",
      secret: "사건의 시작과 연결된 기억 일부를 스스로 봉인하고 있다.",
      voice: "짧고 정확한 문장. 감정이 커질수록 오히려 차분해진다.",
      state: "진실을 의심하기 시작함 · 안전",
      color: "#f6b44b",
    },
    {
      id: "ally",
      name: "도진",
      role: "조력자",
      archetype: "믿을 수 없는 안내자",
      desire: "과거의 실패를 바로잡고 서윤을 예정된 파국에서 벗어나게 한다.",
      fear: "진실을 말하는 순간 관계가 끝나는 것",
      secret: "적대자와 거래한 기록을 숨기고 있다.",
      voice: "농담처럼 본심을 흘리고 중요한 순간에는 존댓말을 쓴다.",
      state: "서윤에게 접근함 · 의도 불명",
      color: "#73c5d8",
    },
    {
      id: "rival",
      name: "해원",
      role: "라이벌",
      archetype: "닮은꼴 경쟁자",
      desire: "주인공보다 먼저 핵심 증거를 차지해 자신의 가치를 증명한다.",
      fear: "언제나 두 번째로 기억되는 것",
      secret: "주인공을 살리기 위해 한 번 결정적인 증거를 없앴다.",
      voice: "단정적인 어조. 질문을 받아도 질문으로 되돌려준다.",
      state: "독자적인 조사 중 · 경쟁",
      color: "#c796ff",
    },
    {
      id: "antagonist",
      name: "태석",
      role: "적대자",
      archetype: "질서를 지키는 파괴자",
      desire: "자신이 설계한 질서가 유일한 해답임을 증명한다.",
      fear: "통제할 수 없는 우연",
      secret: "최초의 사건은 계획이 아니라 실수에서 시작됐다.",
      voice: "친절하고 논리적이며 상대의 이름을 자주 부른다.",
      state: "주인공을 관찰 중 · 우위",
      color: "#ff7b72",
    },
  ];

  const episodes: Episode[] = Array.from({ length: total }, (_, index) => {
    const number = index + 1;
    const stageIndex = Math.min(11, Math.floor(index / arcSize));
    const cycle = Math.floor(index / titleSeeds.length) + 1;
    const isTurning = number % arcSize === 0 || number === total;
    return {
      number,
      title: titleSeeds[index % titleSeeds.length] + (cycle > 1 ? " " + cycle : ""),
      stage: stageNames[stageIndex],
      beat:
        beatSeeds[stageIndex] +
        (isTurning ? " 이 선택은 다음 구간의 목표와 관계를 완전히 바꾼다." : " 작은 단서가 다음 회차의 행동을 촉발한다."),
      emotion: emotionSeeds[index % emotionSeeds.length],
      hook: isTurning
        ? "마지막 순간, 지금까지의 전제를 뒤집는 인물의 정체가 드러난다."
        : "주인공만 알아볼 수 있는 흔적이 예상하지 못한 장소에서 발견된다.",
      status: number === 1 ? "draft" : "planned",
      words: number === 1 ? 1260 : 0,
    };
  });

  return {
    logline: input.genre + "의 세계에서, " + shortSynopsis + " 주인공은 진실을 밝히기 위해 가장 두려운 선택을 해야 한다.",
    theme: "진실을 안다는 것은 무엇을 책임지는 일인가",
    worldRule: "모든 힘과 선택에는 같은 크기의 대가가 따른다. 예외처럼 보이는 현상은 아직 드러나지 않은 대가를 가진다.",
    centralQuestion: "주인공은 진실과 소중한 관계가 충돌할 때 무엇을 선택할 것인가?",
    endingPromise: "초반의 작은 이상 징후가 최종 사건의 원인이었음이 밝혀지고, 주인공의 첫 선택이 새로운 의미를 얻는다.",
    characters,
    episodes,
    foreshadows: [
      { id: "f1", label: "멈춘 손목시계", seedEpisode: 1, payoffEpisode: Math.max(12, Math.round(total * 0.48)), status: "seeded", note: "사건이 반복된 시각이 아니라 누군가 기억을 지운 시각이다." },
      { id: "f2", label: "도진의 바뀐 호칭", seedEpisode: 3, payoffEpisode: Math.max(14, Math.round(total * 0.62)), status: "developing", note: "과거에 주인공을 알고 있었다는 언어적 흔적." },
      { id: "f3", label: "존재하지 않는 7번 출구", seedEpisode: 7, payoffEpisode: Math.max(16, Math.round(total * 0.81)), status: "planned", note: "세계관 규칙의 예외와 적대자의 최초 실수로 연결." },
    ],
    ideas: [
      { title: "조력자가 먼저 한 배신", source: "도진의 비밀", span: "3~5화", reason: "배신처럼 보이는 행동이 장기적으로 주인공을 보호했다는 이중 해석을 만든다.", energy: "반전" },
      { title: "주인공 없는 하루", source: "봉인된 기억", span: "2화", reason: "다른 인물의 시점으로 같은 사건을 재구성해 정보 격차를 자연스럽게 확장한다.", energy: "감정" },
      { title: "승리의 청구서", source: "세계관의 대가 규칙", span: "5~8화", reason: "쉬운 해결을 막고 다음 아크를 여는 필연적인 후유증을 만든다.", energy: "긴장" },
      { title: "적대자의 정당한 하루", source: "태석의 욕망", span: "외전 1화", reason: "악역의 논리를 독자가 이해하게 해 최종 선택의 무게를 높인다.", energy: "확장" },
    ],
    manuscript:
      "비가 오지 않았는데도 골목은 젖어 있었다.\n\n서윤은 멈춘 손목시계를 귀에 가져갔다. 초침은 움직이지 않았지만, 아주 가까이에서 누군가 문을 두드리는 소리가 났다. 세 번. 잠시 멎었다가 다시 두 번.\n\n그 시각은 어젯밤과 같았다. 11시 47분.\n\n‘우연일 리 없어.’\n\n고개를 들자 골목 끝에 한 남자가 서 있었다. 우산도 없이 비어 있는 하늘을 올려다보던 그는 서윤과 눈이 마주치자 오래 기다렸다는 듯 웃었다.\n\n“이번에는 늦지 않았네요.”\n\n서윤은 그를 처음 봤다. 그런데 남자는 서윤이 가장 싫어하는 옛 호칭으로 그녀를 불렀다.\n\n그 순간, 멈췄던 초침이 거꾸로 움직이기 시작했다.",
    memories: [
      { category: "물건", subject: "멈춘 손목시계", fact: "11시 47분에 멈춰 있으며 가까이 대면 문 두드리는 소리가 난다.", episode: 1, confidence: 98, locked: true },
      { category: "인물", subject: "서윤", fact: "도진을 처음 본다고 생각하지만 그가 사용한 옛 호칭에 반응한다.", episode: 1, confidence: 92, locked: false },
    ],
    issues: [],
    currentSummary: "서윤은 멈춘 손목시계의 이상 현상을 확인하고 자신을 과거의 호칭으로 부르는 도진과 처음 마주쳤다.",
  };
}

export function createSampleProject(): StoryProject {
  const input: ProjectInput = {
    title: "달빛 아래 마지막 편집자",
    synopsis: "사라진 작가들의 원고를 복원하는 편집자가 미완성 소설 속 사건이 현실에서 반복되고 있음을 발견한다. 마지막 원고를 완성하면 실종된 언니를 되찾을 수 있지만, 결말을 쓰는 순간 현실의 누군가가 소설 속에서 사라진다.",
    genre: "현대 판타지 미스터리",
    tone: "서늘하지만 따뜻한",
    targetEpisodes: 80,
  };
  return { id: "sample", ...input, status: "설계 중", content: buildStory(input) };
}
