-- CreateTable
CREATE TABLE "Smlouva" (
    "id" SERIAL NOT NULL,
    "nazev" TEXT NOT NULL,
    "castka" DOUBLE PRECISION NOT NULL,
    "kategorie" TEXT NOT NULL,
    "datum" TIMESTAMP(3) NOT NULL,
    "dodavatel" TEXT NOT NULL,
    "zadavatel" TEXT NOT NULL,
    "typ_rizeni" TEXT DEFAULT 'standardní',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Smlouva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dodavatel" (
    "nazev" TEXT NOT NULL,
    "ico" TEXT NOT NULL,
    "datum_zalozeni" TIMESTAMP(3) NOT NULL,
    "pocet_zamestnancu" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dodavatel_pkey" PRIMARY KEY ("nazev")
);

-- CreateTable
CREATE TABLE "Dodatek" (
    "id" SERIAL NOT NULL,
    "smlouva_id" INTEGER NOT NULL,
    "castka" DOUBLE PRECISION NOT NULL,
    "datum" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dodatek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Podnet" (
    "id" SERIAL NOT NULL,
    "jmeno" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "smlouva_id" INTEGER NOT NULL,
    "zprava" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Podnet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dodavatel_ico_key" ON "Dodavatel"("ico");

-- AddForeignKey
ALTER TABLE "Dodatek" ADD CONSTRAINT "Dodatek_smlouva_id_fkey" FOREIGN KEY ("smlouva_id") REFERENCES "Smlouva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Podnet" ADD CONSTRAINT "Podnet_smlouva_id_fkey" FOREIGN KEY ("smlouva_id") REFERENCES "Smlouva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
