import { joaat } from './hash.ts';

export type Category = 'death' | 'footsteps' | 'weapons' | 'other';
export interface Classification { category: Category; sub: string; action?: string }

/** Diccionario hash→nombre. Solo se conservan los hashes que existen en los bancos cargados. */
export class NameDict {
  private map = new Map<number, string>();
  get size() { return this.map.size; }
  addLines(text: string, wanted: Set<number>): number {
    let found = 0;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) continue;
      const h = joaat(line) & 0x1fffffff;
      if (wanted.has(h) && !this.map.has(h)) { this.map.set(h, line); found++; }
    }
    return found;
  }
  get(id: number): string | undefined { return this.map.get(id); }
}

const R = (s: string) => new RegExp(s, 'i');
const DEATH = R('die|death|dying|dead|scream|pain|hurt|agony|grunt|moan|gasp|wound|ko_|cough_blood|injur');
const FOOT = R('step|foot|walk|run_|sprint|shoe|boot|land|jump_land|tread|wade|swim_');
const SURF: [string, RegExp][] = [
  ['Cemento', R('concrete|cement|pavement|sidewalk')], ['Asfalto', R('asphalt|tarmac|road')], ['Madera', R('wood|plank|timber|deck')],
  ['Metal', R('metal|steel|iron|grate|ladder')], ['Tierra', R('dirt|mud|sand|gravel|soil|rock|stone')], ['Hierba', R('grass|lawn|bush|leaf|foliage')],
  ['Agua', R('water|puddle|wade|splash')], ['Interior', R('carpet|tile|marble|lino|indoor|interior|floor|rug')],
];
const WEAP = R('pistol|smg|rifle|shotgun|sniper|revolver|carbine|minigun|launcher|grenade|machinegun|mg_|glock|ak47|m4|mp5|uzi|gun|bullet|reload|clip|mag_|bolt_|shell|casing|shot_|_shot|fire_|_fire|weapon|ricochet');
const WCLASS: [string, RegExp][] = [
  ['PISTOLS', R('pistol|revolver|handgun|glock|deagle|combatpistol')], ['SMG', R('smg|uzi|mp5|micro|machinepistol')],
  ['SHOTGUNS', R('shotgun|pump|sawn|autoshot')], ['SNIPERS', R('sniper|marksman|heavysniper')],
  ['RIFLES', R('rifle|carbine|assault|ak47|m4|advanced|bullpup|special')],
];
const WACT: [string, RegExp][] = [
  ['Disparo', R('shot|fire|bang|blast|shoot')], ['Recarga', R('reload|clip|mag_|magazine')],
  ['Mecánico', R('bolt|rack|slide|cock|click|mech|safety|pump_|rattle')], ['Casquillo', R('shell|casing|eject|brass')],
  ['Impacto', R('impact|ricochet|ric_|bullet_hit|hit')],
];

/** Clasifica SOLO a partir de un nombre real resuelto. Sin nombre → null (no se inventa categoría). */
export function classifyName(name: string | undefined): Classification | null {
  if (!name) return null;
  if (WEAP.test(name)) {
    const sub = WCLASS.find(([, r]) => r.test(name))?.[0] ?? 'OTHER';
    return { category: 'weapons', sub, action: WACT.find(([, r]) => r.test(name))?.[0] };
  }
  if (FOOT.test(name)) return { category: 'footsteps', sub: SURF.find(([, r]) => r.test(name))?.[0] ?? 'Sin superficie' };
  if (DEATH.test(name)) return { category: 'death', sub: /die|death|dying|dead/i.test(name) ? 'Muerte' : /scream/i.test(name) ? 'Gritos' : 'Dolor / daño' };
  return null;
}

/** Agrupa pasos por superficie+base de nombre (sufijo numérico = variación). */
export function variationBase(name: string): string { return name.replace(/[_\-]?\d+$/, ''); }
