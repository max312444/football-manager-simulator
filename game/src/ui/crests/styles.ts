// 엠블럼 디자인 설정 (게임 화면용 디자인 — 출처 데이터가 아님)
// 실제 로고를 복제하지 않고, 모양 · 색 · 줄무늬 · 머리글자로 구단의 인상만 살린다.
// 실제 로고 파일을 쓰고 싶으면 game/src/assets/crests/<구단ID>.png|svg|webp 를 넣으면 그 파일이 우선 표시된다.

export type CrestShape = 'shield' | 'round' | 'oval' | 'pointed' | 'diamond' | 'cut';
export type CrestPattern = 'solid' | 'stripes' | 'halves' | 'sash' | 'hoops' | 'quarters' | 'band';
/** 가운데 문장 (일반적인 문장 요소. 실제 로고 그림이 아님) */
export type CrestCharge = 'letters' | 'ball' | 'crown' | 'cannon' | 'bird' | 'star' | 'tower' | 'cross' | 'fleur';

export interface CrestStyle {
  shape: CrestShape;
  /** [바탕, 무늬/두번째 색, 테두리] */
  colors: [string, string, string];
  pattern: CrestPattern;
  mark?: string;      // 머리글자 (없으면 구단 약칭)
  markColor?: string;
  star?: boolean;     // 위쪽 작은 별
  charge?: CrestCharge;
}

const S = (shape: CrestShape, a: string, b: string, rim: string, pattern: CrestPattern = 'solid', mark?: string, extra: Partial<CrestStyle> = {}): CrestStyle =>
  ({ shape, colors: [a, b, rim], pattern, mark, ...extra });

const GOLD = '#c9a646', NAVY = '#14213d', WHITE = '#f4f4f2', BLACK = '#141414';

export const CREST_STYLES: Record<string, CrestStyle> = {
  // 잉글랜드
  arsenal: S('cut', '#db0007', WHITE, GOLD, 'band', 'AFC', { markColor: GOLD, charge: 'cannon' }),
  liverpool: S('shield', '#c8102e', '#00a398', GOLD, 'solid', 'LFC', { markColor: '#f6eb61', charge: 'bird' }),
  'man-city': S('round', '#6cabdd', NAVY, NAVY, 'solid', 'MCFC', { markColor: WHITE }),
  'man-utd': S('shield', '#da291c', '#fbe122', BLACK, 'band', 'MU', { markColor: '#fbe122', charge: 'ball' }),
  chelsea: S('round', '#034694', WHITE, GOLD, 'solid', 'CFC', { markColor: WHITE, charge: 'ball' }),
  tottenham: S('shield', NAVY, WHITE, NAVY, 'band', 'THFC', { markColor: WHITE, charge: 'bird' }),
  newcastle: S('round', BLACK, WHITE, '#41b6e6', 'stripes', 'NUFC', { charge: 'tower' }),
  'aston-villa': S('shield', '#670e36', '#95bfe5', '#fee505', 'band', 'AVFC', { star: true, charge: 'ball' }),
  everton: S('cut', '#003399', WHITE, WHITE, 'solid', 'EFC', { charge: 'tower' }),
  'west-ham': S('shield', '#7a263a', '#1bb1e7', '#f3d459', 'band', 'WHU', { charge: 'cross' }),
  leeds: S('round', WHITE, '#1d428a', '#ffcd00', 'solid', 'LUFC', { markColor: '#1d428a' }),
  brighton: S('round', '#0057b8', WHITE, WHITE, 'solid', 'BHA', { charge: 'bird' }),
  wolves: S('shield', '#fdb913', BLACK, BLACK, 'solid', 'WWFC', { markColor: BLACK }),
  'crystal-palace': S('shield', '#1b458f', '#c4122e', '#a7a5a6', 'halves', 'CPFC', { charge: 'bird' }),
  fulham: S('shield', WHITE, BLACK, BLACK, 'solid', 'FFC', { markColor: BLACK }),
  brentford: S('round', '#e30613', WHITE, BLACK, 'stripes', 'BFC'),
  bournemouth: S('shield', '#da291c', BLACK, BLACK, 'stripes', 'AFCB'),
  'nottm-forest': S('cut', '#dd0000', WHITE, WHITE, 'solid', 'NFFC', { charge: 'ball' }),
  burnley: S('shield', '#6c1d45', '#99d6ea', GOLD, 'band', 'BFC', { charge: 'ball' }),
  sunderland: S('shield', '#eb172b', WHITE, BLACK, 'stripes', 'SAFC'),
  southampton: S('round', '#d71920', WHITE, '#130c0e', 'stripes', 'SFC', { charge: 'ball' }),
  leicester: S('round', '#003090', WHITE, GOLD, 'solid', 'LCFC', { charge: 'ball' }),
  ipswich: S('shield', '#0033a0', WHITE, '#de2c37', 'solid', 'ITFC'),
  watford: S('round', '#fbee23', '#ed2127', BLACK, 'solid', 'WFC', { markColor: BLACK }),
  'sheffield-utd': S('shield', '#ee2737', WHITE, BLACK, 'stripes', 'SUFC', { charge: 'cross' }),
  blackburn: S('shield', '#009ee0', WHITE, NAVY, 'halves', 'BRFC'),
  bolton: S('round', WHITE, '#263c7e', '#263c7e', 'solid', 'BWFC', { markColor: '#263c7e' }),
  middlesbrough: S('round', '#e11b22', WHITE, WHITE, 'solid', 'MFC'),
  'west-brom': S('shield', '#122f67', WHITE, WHITE, 'stripes', 'WBA'),
  stoke: S('shield', '#e03a3e', WHITE, WHITE, 'stripes', 'SCFC'),
  'norwich': S('round', '#fff200', '#00a650', '#00a650', 'solid', 'NCFC', { markColor: '#00a650' }),
  'swansea': S('round', WHITE, BLACK, BLACK, 'solid', 'SCFC', { markColor: BLACK }),
  'hull': S('round', '#f5a12d', BLACK, BLACK, 'solid', 'HCAFC', { markColor: BLACK }),
  'cardiff': S('round', '#0070b5', WHITE, '#d11524', 'solid', 'CCFC'),
  'qpr': S('shield', '#1d5ba4', WHITE, WHITE, 'hoops', 'QPR'),
  'portsmouth': S('round', '#001489', GOLD, GOLD, 'solid', 'PFC', { star: true }),
  'charlton': S('round', '#d4021d', WHITE, WHITE, 'solid', 'CAFC'),
  'derby': S('shield', WHITE, BLACK, BLACK, 'solid', 'DCFC', { markColor: BLACK }),
  'birmingham': S('round', '#0000ff', WHITE, WHITE, 'solid', 'BCFC'),
  'wigan': S('shield', '#1d59af', WHITE, WHITE, 'stripes', 'WAFC'),
  'luton': S('round', '#f78f1e', NAVY, NAVY, 'solid', 'LTFC'),

  // 스페인
  'real-madrid': S('round', WHITE, '#3e2b7a', GOLD, 'band', 'RM', { markColor: '#3e2b7a', charge: 'crown' }),
  barcelona: S('pointed', '#a50044', '#004d98', GOLD, 'stripes', 'FCB', { markColor: '#edbb00', charge: 'cross' }),
  'atletico-madrid': S('pointed', '#cb3524', WHITE, '#272e61', 'stripes', 'ATM', { charge: 'ball' }),
  sevilla: S('pointed', WHITE, '#d71920', '#d71920', 'band', 'SFC', { markColor: '#d71920', charge: 'ball' }),
  valencia: S('round', BLACK, '#ee3524', '#ffdf1c', 'band', 'VCF', { charge: 'bird' }),
  'athletic-bilbao': S('pointed', '#ee2523', WHITE, BLACK, 'stripes', 'AC', { charge: 'tower' }),
  villarreal: S('oval', '#ffe667', '#005187', '#005187', 'solid', 'VCF', { markColor: '#005187' }),
  'real-sociedad': S('round', '#0067b1', WHITE, GOLD, 'stripes', 'RS', { charge: 'crown' }),
  'real-betis': S('pointed', '#0bb363', WHITE, '#0bb363', 'stripes', 'RB'),
  'celta-vigo': S('pointed', '#8ac3ee', '#e5254e', '#e5254e', 'solid', 'RCC'),
  getafe: S('round', '#005999', WHITE, WHITE, 'solid', 'GCF'),
  osasuna: S('round', '#d91a21', '#0a346f', '#0a346f', 'solid', 'CAO'),
  espanyol: S('pointed', '#007fc8', WHITE, GOLD, 'stripes', 'RCDE', { charge: 'crown' }),
  'real-mallorca': S('round', '#e20613', BLACK, GOLD, 'solid', 'RCDM'),
  mallorca: S('round', '#e20613', BLACK, GOLD, 'solid', 'RCDM', { charge: 'crown' }),
  deportivo: S('round', '#0067b1', WHITE, '#0067b1', 'stripes', 'RCD', { charge: 'crown' }),
  malaga: S('pointed', '#0076c0', WHITE, GOLD, 'stripes', 'MCF'),
  'real-zaragoza': S('pointed', WHITE, '#0f3a7d', '#0f3a7d', 'band', 'RZ', { markColor: '#0f3a7d' }),
  'rayo-vallecano': S('pointed', WHITE, '#e53027', '#e53027', 'sash', 'RV', { markColor: BLACK }),
  alaves: S('pointed', '#0761af', WHITE, WHITE, 'stripes', 'DA'),
  girona: S('pointed', '#cd2534', WHITE, WHITE, 'stripes', 'GFC'),
  'las-palmas': S('round', '#ffe400', '#0b4f9f', '#0b4f9f', 'solid', 'UDLP', { markColor: '#0b4f9f' }),

  // 이탈리아
  juventus: S('oval', BLACK, WHITE, BLACK, 'stripes', 'J'),
  inter: S('round', '#010e80', BLACK, GOLD, 'stripes', 'IM', { markColor: GOLD }),
  milan: S('oval', '#fb090b', BLACK, BLACK, 'stripes', 'ACM', { charge: 'cross' }),
  roma: S('shield', '#8e1f2f', '#f0bc42', '#f0bc42', 'solid', 'ASR', { markColor: '#f0bc42', charge: 'ball' }),
  lazio: S('cut', '#87d8f7', WHITE, '#13284b', 'solid', 'SSL', { markColor: '#13284b', charge: 'bird' }),
  napoli: S('round', '#12a0d7', WHITE, WHITE, 'solid', 'N'),
  fiorentina: S('pointed', '#5b2b82', WHITE, '#d0021b', 'solid', 'ACF', { charge: 'fleur' }),
  atalanta: S('round', '#1e71b8', BLACK, BLACK, 'stripes', 'A'),
  torino: S('shield', '#881f19', WHITE, GOLD, 'solid', 'TFC', { charge: 'ball' }),
  genoa: S('shield', '#a41d36', '#00264d', GOLD, 'halves', 'GCFC', { charge: 'cross' }),
  sampdoria: S('shield', '#1b5497', WHITE, '#e2001a', 'hoops', 'UCS'),
  bologna: S('shield', '#1a2f48', '#a21c26', WHITE, 'halves', 'BFC'),
  udinese: S('shield', BLACK, WHITE, WHITE, 'stripes', 'UC'),
  parma: S('shield', '#ffd200', '#1b4094', '#1b4094', 'band', 'PC', { markColor: '#1b4094' }),
  cagliari: S('shield', '#a0172b', '#002350', '#002350', 'halves', 'CC'),
  sassuolo: S('round', '#00a752', BLACK, BLACK, 'stripes', 'USS'),
  chievo: S('oval', '#ffe600', '#003c82', '#003c82', 'solid', 'CV', { markColor: '#003c82' }),
  spal: S('round', '#6ec6f1', WHITE, '#0a2240', 'stripes', 'SPAL', { markColor: '#0a2240' }),

  // 독일
  bayern: S('round', '#dc052d', '#0066b2', WHITE, 'quarters', 'FCB'),
  dortmund: S('round', '#fde100', BLACK, BLACK, 'solid', 'BVB', { markColor: BLACK }),
  leverkusen: S('cut', '#e32221', BLACK, BLACK, 'solid', 'B04', { charge: 'cross' }),
  schalke: S('shield', '#004d9d', WHITE, WHITE, 'solid', 'S04'),
  gladbach: S('diamond', WHITE, BLACK, '#00a651', 'solid', 'BMG', { markColor: BLACK }),
  frankfurt: S('round', '#e1000f', BLACK, BLACK, 'solid', 'SGE', { charge: 'bird' }),
  wolfsburg: S('shield', '#65b32e', WHITE, WHITE, 'solid', 'W'),
  stuttgart: S('shield', WHITE, '#e32219', GOLD, 'band', 'VfB', { markColor: '#e32219', charge: 'ball' }),
  leipzig: S('oval', WHITE, '#dd0741', '#0c2043', 'solid', 'RBL', { markColor: '#dd0741' }),
  'werder-bremen': S('diamond', '#1d9053', WHITE, WHITE, 'solid', 'W'),
  hamburg: S('diamond', '#0a3f86', BLACK, WHITE, 'quarters', 'HSV'),
  hertha: S('shield', '#005ca9', WHITE, WHITE, 'stripes', 'BSC', { charge: 'bird' }),
  hoffenheim: S('shield', '#1961b5', WHITE, WHITE, 'solid', 'TSG'),
  freiburg: S('shield', BLACK, '#e30613', '#e30613', 'solid', 'SCF', { charge: 'tower' }),
  mainz: S('round', '#ed1c24', WHITE, WHITE, 'solid', '05'),
  koln: S('shield', WHITE, '#ed1c24', '#ed1c24', 'band', 'EFF', { markColor: '#ed1c24' }),
  augsburg: S('shield', '#ba3733', '#46714d', WHITE, 'solid', 'FCA'),
  'union-berlin': S('round', '#eb1923', '#ffd200', '#ffd200', 'solid', 'FCU'),
  bochum: S('shield', '#005ca9', WHITE, WHITE, 'solid', 'VfL'),
  'st-pauli': S('shield', '#6b3e26', WHITE, WHITE, 'solid', 'FCSP'),
  'heidenheim': S('round', '#e2001a', '#003b79', '#003b79', 'solid', 'FCH'),

  // 프랑스
  psg: S('round', '#004170', '#da291c', WHITE, 'band', 'PSG', { charge: 'tower' }),
  marseille: S('shield', '#2faee0', WHITE, GOLD, 'solid', 'OM', { charge: 'star' }),
  lyon: S('round', WHITE, '#da0812', '#0b2b63', 'band', 'OL', { markColor: '#0b2b63', charge: 'ball' }),
  monaco: S('round', '#e7212c', WHITE, GOLD, 'sash', 'ASM', { charge: 'crown' }),
  lille: S('shield', '#e01e13', '#24216a', '#24216a', 'solid', 'LOSC', { charge: 'fleur' }),
  rennes: S('cut', '#e13327', BLACK, BLACK, 'solid', 'SRFC', { charge: 'ball' }),
  nice: S('shield', '#c5232d', BLACK, GOLD, 'stripes', 'OGCN', { charge: 'bird' }),
  lens: S('shield', '#ed1c24', '#ffd700', '#ffd700', 'halves', 'RCL'),
  bordeaux: S('shield', '#001c50', WHITE, WHITE, 'band', 'FCGB', { charge: 'fleur' }),
  'saint-etienne': S('round', '#009639', WHITE, WHITE, 'solid', 'ASSE'),
  nantes: S('round', '#fce500', '#00843d', '#00843d', 'solid', 'FCN', { markColor: '#00843d' }),
  montpellier: S('shield', '#00205b', '#ff6a13', '#ff6a13', 'solid', 'MHSC'),
  strasbourg: S('shield', '#0083c4', WHITE, WHITE, 'solid', 'RCSA', { charge: 'cross' }),
  toulouse: S('round', '#5b2a86', WHITE, WHITE, 'solid', 'TFC', { charge: 'cross' }),
  auxerre: S('shield', WHITE, '#003d7c', '#003d7c', 'solid', 'AJA', { markColor: '#003d7c' }),
  brest: S('round', '#e2001a', WHITE, WHITE, 'solid', 'SB29'),
  reims: S('shield', '#e30613', WHITE, WHITE, 'sash', 'SDR'),
};

/** 나라별 기본 모양 (설정이 없는 구단) */
export const NATION_SHAPE: Record<string, CrestShape> = {
  ENG: 'shield', WAL: 'shield', ESP: 'pointed', ITA: 'shield', GER: 'round', FRA: 'shield', MON: 'round',
};
