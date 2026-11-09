// 엠블럼 디자인 형식 (값은 데이터의 구단 파일 crest 항목 — tools/data_pipeline/crest-styles.js에서 생성)
export type CrestShape = 'shield' | 'round' | 'oval' | 'pointed' | 'diamond' | 'cut';
export type CrestPattern = 'solid' | 'stripes' | 'halves' | 'sash' | 'hoops' | 'quarters' | 'band';
/** 가운데 문장 (일반적인 문장 요소. 실제 로고 그림이 아님) */
export type CrestCharge = 'letters' | 'ball' | 'crown' | 'cannon' | 'bird' | 'star' | 'tower' | 'cross' | 'fleur';

export interface CrestStyle {
  shape: CrestShape;
  /** [바탕, 무늬/두번째 색, 테두리] */
  colors: [string, string, string];
  pattern: CrestPattern;
  mark?: string;
  markColor?: string;
  star?: boolean;
  charge?: CrestCharge;
}

/** 나라별 기본 모양 (엠블럼 정보가 없는 구단) */
export const NATION_SHAPE: Record<string, CrestShape> = {
  ENG: 'shield', WAL: 'shield', ESP: 'pointed', ITA: 'shield', GER: 'round', FRA: 'shield', MON: 'round',
};
