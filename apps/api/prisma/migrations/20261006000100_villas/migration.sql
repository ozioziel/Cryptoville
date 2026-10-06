-- Los 3 barrios pasan a ser villas y se suma la Villa Audiovisual.
-- Se renombran los valores del enum: los locales existentes conservan su villa y sus datos.
-- El campo se sigue llamando "barrio" en la base y en el código.
ALTER TYPE "Barrio" RENAME VALUE 'diseno' TO 'creativo';
ALTER TYPE "Barrio" RENAME VALUE 'tecnologia' TO 'tech';
ALTER TYPE "Barrio" RENAME VALUE 'clases' TO 'academy';

-- El valor nuevo se usa recién en la migración siguiente (Postgres no deja usarlo en la misma transacción).
ALTER TYPE "Barrio" ADD VALUE IF NOT EXISTS 'audiovisual';
