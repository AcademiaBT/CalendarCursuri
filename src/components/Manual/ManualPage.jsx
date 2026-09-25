export default function ManualPage() {
  // HashRouter foloseste hash-ul din URL pentru rutare (#/manual) - o ancora
  // obisnuita (href="#calendar") ar schimba acel hash, iar router-ul ar
  // interpreta-o gresit ca pe o ruta noua, trimitand userul in altă parte
  // din aplicatie. In loc de ancore, facem scroll manual la sectiune, fara
  // sa atingem deloc hash-ul din URL.
  function jumpTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="manual-page">
      <h2>Manualul aplicației</h2>
      <p className="admin-hint">
        Ghid complet al funcțiilor din Programator Cursuri. Folosește cuprinsul de mai jos ca să
        sari direct la secțiunea care te interesează.
      </p>

      <nav className="manual-toc">
        <button type="button" onClick={() => jumpTo('calendar')}>1. Calendar</button>
        <button type="button" onClick={() => jumpTo('curs')}>2. Adăugarea și editarea unui curs</button>
        <button type="button" onClick={() => jumpTo('rapoarte')}>3. Rapoarte</button>
        <button type="button" onClick={() => jumpTo('setari')}>4. Setări</button>
        <button type="button" onClick={() => jumpTo('administrare')}>5. Administrare</button>
        <button type="button" onClick={() => jumpTo('alerte')}>6. Alerta „Cursuri neclarificate"</button>
      </nav>

      <section id="calendar" className="manual-section">
        <h3>1. Calendar</h3>
        <p>
          Vizualizarea principală a aplicației. Are două moduri, comutabile din bara de sus:
          <strong> Lunar</strong> (o privire de ansamblu, cursurile apar ca etichete colorate în
          celula fiecărei zile) și <strong>Săptămânal</strong> (o vedere de tip Gantt, cu bare
          orizontale pentru fiecare curs, plus coloane de atribute în dreapta).
        </p>
        <ul>
          <li>
            <strong>Navigare</strong>: „Luna anterioară" / „Luna următoare" (sau echivalentul
            săptămânal), „Azi" — sare direct la ziua curentă, și <strong>„Salt la"</strong> — alegi
            o dată oarecare dintr-un calendar, aplicația sare direct la luna/săptămâna care o
            conține.
          </li>
          <li>
            <strong>Culoare după</strong>: alegi dacă barele/etichetele sunt colorate după durata
            cursului, după responsabil, sau după categorie. Legenda de sub bara de navigare arată
            exact ce înseamnă fiecare culoare și are checkbox-uri — poți ascunde temporar anumite
            valori din calendar (ex: ascunzi tot ce e „Pustiu'", rămân doar cursurile altor
            responsabili).
          </li>
          <li>
            <strong>Cursuri neclarificate (TBD)</strong>: dacă trainerul, sala sau responsabilul nu
            sunt încă decise, cursul apare cu fundal gri neutru și eticheta roșie „TBD" direct pe
            bară.
          </li>
          <li>
            <strong>Cursuri anulate</strong>: apar cu text tăiat (linie peste denumire) și eticheta
            „ANULAT" — rămân vizibile, pentru istoric, dar nu mai ocupă sala/trainerul (vezi
            secțiunea 2).
          </li>
          <li>
            <strong>Editare rapidă, direct în tabel (Săptămânal)</strong>: câmpurile fără nicio
            verificare de conflict — Nr. participanți, Grup participanți, Categorie, Public țintă,
            Mail invitare, Catering, Observații — sunt editabile direct în celulă: click, scrii,
            Enter sau click în afară salvează. Data/ora, Trainer, Sala și Responsabilul rămân
            editabile doar prin formularul complet (au verificări de suprapunere).
          </li>
          <li>
            <strong>Redimensionare</strong>: în Săptămânal poți trage marginea blocului de zile sau
            a coloanelor de atribute, ca să le lărgești/îngustezi; „Rânduri" (+/-) modifică
            înălțimea rândurilor pentru toate cursurile.
          </li>
          <li>
            Click pe un curs (bară, etichetă sau rând din lista de detalii) deschide formularul
            complet de editare.
          </li>
        </ul>
      </section>

      <section id="curs" className="manual-section">
        <h3>2. Adăugarea și editarea unui curs</h3>
        <p>
          Butonul <strong>„+ Adaugă"</strong> din Calendar, sau click pe un curs existent, deschide
          formularul complet.
        </p>
        <ul>
          <li>
            <strong>Curs de o zi</strong> (debifat implicit) — dacă bifezi, data de sfârșit rămâne
            mereu sincronizată cu data de start.
          </li>
          <li>
            <strong>Traineri</strong>: câmp cu mai multe valori (co-facilitare — un curs poate avea
            mai mulți traineri deodată). Tastezi un nume și apeși „+" sau Enter ca să-l adaugi;
            fiecare trainer adăugat apare ca o etichetă cu „×" de eliminare.
          </li>
          <li>
            <strong>Trainer / Sală / Responsabil</strong>: scrii direct în câmp — dacă numele nu
            există deja în listă, se creează automat la salvare (nu trebuie să-l adaugi separat din
            Administrare). Dacă ce ai scris seamănă cu un nume deja existent (posibil typo), apare
            un mesaj discret: „seamănă cu X, deja existent — folosește-l · nu, e nou".
          </li>
          <li>
            <strong>Verificare de conflict</strong>: dacă sala sau vreun trainer e deja ocupat în
            acel interval, apare un avertisment (înainte să apeși Salvează) și, la nevoie, un mesaj
            de blocare la salvare — cu excepția sălii „Online" (poate avea oricâte cursuri
            simultan) și a cursurilor anulate (nu mai contează pentru verificare).
          </li>
          <li>
            <strong>Curs anulat</strong> (vizibil doar la editarea unui curs existent): bifezi
            checkbox-ul roșu „Curs anulat" — cursul rămâne în calendar, marcat distinct, dar sala
            și trainerii devin disponibili pentru alte cursuri în același interval.
          </li>
          <li>
            <strong>Clonează curs</strong> (buton, la editarea unui curs existent): deschide un
            formular nou, precompletat identic cu originalul, cu excepția datei (resetată la azi)
            și a stării „anulat" (o clonă pornește mereu activă). Util pentru cursuri recurente.
          </li>
          <li>
            <strong>Ștergere</strong>: elimină definitiv cursul — spre diferență de „Curs anulat",
            nu mai rămâne nimic vizibil, nici pentru istoric.
          </li>
        </ul>
      </section>

      <section id="rapoarte" className="manual-section">
        <h3>3. Rapoarte</h3>
        <p>Două moduri, comutabile din partea de sus: „Listă cursuri" și „Statistici".</p>
        <ul>
          <li>
            <strong>Filtre</strong>: interval de date, trainer, sală, tip curs, responsabil,
            categorie, public țintă, căutare liberă (în denumire/observații), „Doar neclarificate
            (TBD)" și „Ascunde cursurile anulate".
          </li>
          <li>
            <strong>Listă cursuri</strong>: un tabel cu toate atributele; valorile TBD apar roșu și
            bold, cursurile anulate apar tăiate cu eticheta „ANULAT".
          </li>
          <li>
            <strong>Statistici</strong>: încărcare traineri, ocupare săli, încărcare responsabili,
            mix categorii și mix tip curs — cu bare vizuale și procent de ocupare. Cursurile anulate
            sunt <strong>excluse</strong> din toate aceste cifre (un curs anulat nu s-a mai ținut,
            n-ar trebui să umfle statisticile). Un curs cu mai mulți traineri (co-facilitare)
            contează pentru fiecare dintre ei.
          </li>
          <li>
            <strong>Export și printare</strong>: „Descarcă PDF", „Descarcă Excel" și „🖨️ Printează"
            — disponibile pentru orice e afișat curent (listă sau statistici).
          </li>
        </ul>
      </section>

      <section id="setari" className="manual-section">
        <h3>4. Setări</h3>
        <ul>
          <li>
            <strong>Coloane vizibile în Săptămânal</strong>: alegi ce atribute apar în dreapta
            zilelor (Interval orar, Trainer, Sala, Zile lucrătoare, Nr. participanți, Categorie,
            Public țintă, etc.) și în ce ordine.
          </li>
          <li>
            <strong>Culori personalizate</strong>: dacă „Culoare după" e setat pe Responsabil sau
            Categorie, poți alege manual o culoare pentru fiecare valoare.
          </li>
          <li>
            <strong>Alertă cursuri neclarificate (TBD)</strong>: cu câte zile înainte să fii
            avertizat, sau dezactivare completă a alertei pentru contul tău.
          </li>
          <li><strong>Schimbă parola</strong>: oricând, indiferent de politica de expirare.</li>
        </ul>
      </section>

      <section id="administrare" className="manual-section">
        <h3>5. Administrare</h3>
        <p>Vizibilă doar pentru conturile cu rol de admin.</p>
        <ul>
          <li>
            <strong>Traineri / Săli / Responsabili</strong>: listele care alimentează
            combobox-urile din formularul de curs. Fiecare rând are „editează" (nume, și capacitate
            la Săli) și „șterge". Redenumirea afectează doar ce alegi de acum încolo — cursurile
            deja salvate rămân cu numele vechi.
          </li>
          <li>
            <strong>Import cursuri din Excel</strong>: descarci un model gol, îl completezi, îl
            încarci înapoi. Coloanele sunt recunoscute după antet, nu după poziție; trainer/sală/
            responsabil necunoscute se creează automat; un curs poate avea mai mulți traineri
            într-o singură celulă, separați prin virgulă. Rândurile cu sală/trainer deja ocupate
            sunt respinse una câte una (restul se importă normal), cu un raport clar la final.
          </li>
          <li>
            <strong>Useri</strong>: leagă fiecare cont de rol (user/admin) și de unul sau mai mulți
            responsabili din listă — determină cui i se arată alerta TBD.
          </li>
          <li>
            <strong>Backup automat</strong>: trimite periodic (zilnic/săptămânal/lunar) tot
            calendarul, ca fișier Excel, pe email.
          </li>
        </ul>
      </section>

      <section id="alerte" className="manual-section">
        <h3>6. Alerta „Cursuri neclarificate"</h3>
        <p>
          La logare (și periodic), dacă tu ești responsabilul unui curs care începe în curând (sau
          e deja în desfășurare) și încă are trainer sau sală nedecise, apare un pop-up cu lista
          acelor cursuri — click pe unul te duce direct la formularul lui de editare. Cursurile
          fără niciun responsabil apar pentru orice user logat. Cursurile anulate nu mai declanșează
          alerta.
        </p>
      </section>
    </div>
  )
}
