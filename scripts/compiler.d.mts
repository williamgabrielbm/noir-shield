export type Rule = {id:number;priority:number;action:{type:'block'|'allow'};condition:Record<string,unknown>};
export function parseNetwork(line:string):Rule|null;
export function parseCosmetic(line:string):{domains:string[];selector:string;exception:boolean}|null;
export function compileList(text:string,options?:{maxRules?:number;maxCosmetics?:number;seen?:Set<string>}):{rules:Rule[];cosmetic:{domains:string[];selector:string;exception:boolean}[];stats:{networkSkipped:number;cosmeticSkipped:number;duplicates:number}};
