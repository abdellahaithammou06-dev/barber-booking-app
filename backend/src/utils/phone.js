function normaliserNumeroWhatsApp(numero) {
  if (typeof numero !== 'string') return null;
  let valeur = numero.trim().replace(/[\s().-]/g, '');
  if (valeur.startsWith('00')) valeur = `+${valeur.slice(2)}`;
  if (/^0[5-7]\d{8}$/.test(valeur)) valeur = `+212${valeur.slice(1)}`;
  else if (/^212[5-7]\d{8}$/.test(valeur)) valeur = `+${valeur}`;
  if (!/^\+[1-9]\d{7,14}$/.test(valeur)) return null;
  return valeur;
}

module.exports = { normaliserNumeroWhatsApp };
