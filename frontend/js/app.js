/**
 * Application principale pour la gestion des réservations.
 * Initialise les composants et gère les interactions utilisateur.
 */

// État global
let currentOperationDetails = null;
let operationsCache = [];
let newOpArticlesList = [];
let editOpArticlesList = [];

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
  initEventListeners();
  loadOperations();
});

/**
 * Initialise tous les écouteurs d'événements.
 */
function initEventListeners() {
  // Boutons principaux
  document.getElementById('btnAide').addEventListener('click', ouvrirAide);
  document.getElementById('btnGererOperations').addEventListener('click', ouvrirOperations);
  document.getElementById('mentionsLegales').addEventListener('click', ouvrirMentions);
  document.getElementById('btnValiderFormulaire').addEventListener('click', validerFormulaire);

  // Sélecteur d'opération
  document.getElementById('operationSelect').addEventListener('change', gererAffichageProduits);

  // Boutons des modals
  document.getElementById('btnCreerNouvelleOffre').addEventListener('click', creerNouvelleOffre);
  document.getElementById('btnSauvegarderOffre').addEventListener('click', sauvegarderNouvelleOffre);
  document.getElementById('btnUpdateOffre').addEventListener('click', sauvegarderModificationOffre);
  document.getElementById('btnImprimerReservations').addEventListener('click', imprimerReservations);
  document.getElementById('btnConfirmerSuppression').addEventListener('click', confirmerSuppression);

  // Validation des contacts
  document.getElementById('telClient').addEventListener('input', verifierContacts);
  document.getElementById('emailClient').addEventListener('input', verifierContacts);

  // Bouton ajouter ligne produit
  document.getElementById('btnAjouterLigne').addEventListener('click', ajouterLigneProduit);

  // Gestion des champs pour nouvelle offre
  document.getElementById('newOpType').addEventListener('change', () => gererChampsNouvelleOffre('new'));
  document.getElementById('newOpMode').addEventListener('change', () => gererChampsNouvelleOffre('new'));

  // Gestion des champs pour modification offre
  document.getElementById('editOpType').addEventListener('change', () => gererChampsNouvelleOffre('edit'));
  document.getElementById('editOpMode').addEventListener('change', () => gererChampsNouvelleOffre('edit'));

  // Boutons pour ajouter des articles dans les modals
  document.getElementById('btnAjouterArticle')?.addEventListener('click', () => ajouterArticle('new'));
  document.getElementById('btnAjouterArticleEdit')?.addEventListener('click', () => ajouterArticle('edit'));
}

/**
 * Charge les opérations depuis le backend.
 */
function loadOperations() {
  google.script.run
    .withSuccessHandler(afficherDonnees)
    .withFailureHandler(function(e) {
      showToast("Erreur de connexion : " + e.message, "error");
    })
    .getOperationsData();
}

/**
 * Affiche les données des opérations dans le sélecteur et le tableau.
 * @param {Array} operations - Tableau d'opérations.
 */
function afficherDonnees(operations) {
  operationsCache = operations;
  const select = document.getElementById('operationSelect');
  const tbody = document.getElementById('tableOperationsBody');

  // Remplir le sélecteur
  select.innerHTML = '<option value="" disabled selected>Sélectionnez l\'offre en cours...</option>';
  operations.forEach(op => {
    const option = document.createElement('option');
    option.value = op.id;
    option.setAttribute('data-type', op.type);
    option.setAttribute('data-mode', op.modeSaisie);
    option.setAttribute('data-articles', op.articlesPredefinis);
    option.textContent = `[${op.type}] ${op.nom}`;
    select.appendChild(option);
  });

  // Remplir le tableau des opérations
  tbody.innerHTML = '';
  if (operations.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">Aucune opération trouvée.</td></tr>';
    return;
  }

  operations.forEach(op => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.onclick = function() { voirReservationsDetail(op.id); };

    let pastilleCouleur = op.count > 0 ? 'success' : 'secondary';
    let infoMode = op.type === 'Produit' ? `<small class="text-muted">Saisie : ${op.modeSaisie}</small>` : '';

    tr.innerHTML = `
      <td class="ps-4"><span class="fw-bold text-dark">${op.nom}</span><br>${infoMode}</td>
      <td><small>Du ${op.dateDebut}<br>Au ${op.dateFin}</small></td>
      <td class="text-center"><span class="badge bg-${pastilleCouleur} rounded-pill fs-6">${op.count}</span></td>
      <td class="text-end pe-4">
        <button class="btn btn-sm btn-outline-danger border-0" onclick="event.stopPropagation(); demanderSuppression('${op.id}')" title="Supprimer l'offre">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * Gère l'affichage de la section produits en fonction de l'opération sélectionnée.
 */
function gererAffichageProduits() {
  const select = document.getElementById('operationSelect');
  const optionSelectionnee = select.options[select.selectedIndex];

  const typeOperation = optionSelectionnee.getAttribute('data-type');
  const modeSaisie = optionSelectionnee.getAttribute('data-mode');
  const articlesPredefinis = optionSelectionnee.getAttribute('data-articles');

  const sectionProduits = document.getElementById('sectionProduits');
  const conteneurListe = document.getElementById('listeProduits');
  const btnAjouter = document.getElementById('btnAjouterLigne');

  conteneurListe.innerHTML = '';

  if (typeOperation === 'Produit') {
    sectionProduits.style.display = 'block';
    if (modeSaisie === 'Predefini' && articlesPredefinis) {
      btnAjouter.style.display = 'none';
      articlesPredefinis.split(',').forEach(article => {
        if (!article.trim()) return;
        const div = document.createElement('div');
        div.className = 'row g-2 mb-2 ligne-produit';
        div.innerHTML = `<div class="col-8"><input type="text" class="form-control nom-article bg-light" value="${article.trim()}" readonly></div><div class="col-4"><input type="number" class="form-control quantite-article" placeholder="Qté" min="0"></div>`;
        conteneurListe.appendChild(div);
      });
    } else {
      btnAjouter.style.display = 'inline-block';
      ajouterLigneProduit();
    }
  } else {
    sectionProduits.style.display = 'none';
  }
}

/**
 * Ajoute une ligne de produit au formulaire.
 */
function ajouterLigneProduit() {
  const div = document.createElement('div');
  div.className = 'row g-2 mb-2 ligne-produit';
  div.innerHTML = `
    <div class="col-8">
      <input type="text" class="form-control nom-article" placeholder="Nom de l'article">
    </div>
    <div class="col-3">
      <input type="number" class="form-control quantite-article" placeholder="Qté" min="1">
    </div>
    <div class="col-1 d-flex align-items-center">
      <button type="button" class="btn btn-sm btn-outline-danger border-0" onclick="supprimerLigne(this)">
        <i class="bi bi-x-lg"></i>
      </button>
    </div>
  `;
  document.getElementById('listeProduits').appendChild(div);
}

/**
 * Supprime une ligne de produit.
 * @param {HTMLElement} bouton - Bouton de suppression cliqué.
 */
function supprimerLigne(bouton) {
  bouton.closest('.ligne-produit').remove();
}

/**
 * Ajoute un article à la liste dynamique (pour les modals de création/modification d'offre).
 * @param {string} prefix - Préfixe ('new' ou 'edit').
 */
function ajouterArticle(prefix) {
  const input = document.querySelector(`#${prefix}OpArticlesContainer .${prefix}-article-input`);
  const articleName = input.value.trim();
  
  if (!articleName) {
    showToast("Veuillez saisir un nom d'article.", "error");
    return;
  }

  // Ajouter à la liste
  if (prefix === 'new') {
    newOpArticlesList.push(articleName);
  } else {
    editOpArticlesList.push(articleName);
  }

  // Mettre à jour l'affichage
  afficherListeArticles(prefix);
  
  // Vider l'input
  input.value = '';
}

/**
 * Affiche la liste des articles pour un modal.
 * @param {string} prefix - Préfixe ('new' ou 'edit').
 */
function afficherListeArticles(prefix) {
  const listContainer = document.getElementById(`${prefix}OpArticlesList`);
  const articles = prefix === 'new' ? newOpArticlesList : editOpArticlesList;
  
  listContainer.innerHTML = '';
  
  articles.forEach((article, index) => {
    const div = document.createElement('div');
    div.className = 'd-flex justify-content-between align-items-center mb-1 p-2 bg-light rounded';
    div.innerHTML = `
      <span>${article}</span>
      <button type="button" class="btn btn-sm btn-outline-danger border-0" onclick="supprimerArticle('${prefix}', ${index})">
        <i class="bi bi-x-lg"></i>
      </button>
    `;
    listContainer.appendChild(div);
  });
}

/**
 * Supprime un article de la liste dynamique.
 * @param {string} prefix - Préfixe ('new' ou 'edit').
 * @param {number} index - Index de l'article à supprimer.
 */
function supprimerArticle(prefix, index) {
  if (prefix === 'new') {
    newOpArticlesList.splice(index, 1);
  } else {
    editOpArticlesList.splice(index, 1);
  }
  afficherListeArticles(prefix);
}

/**
 * Vérifie la validité des contacts (téléphone/email).
 */
function verifierContacts() {
  const telInput = document.getElementById('telClient');
  const emailInput = document.getElementById('emailClient');
  const alerteContact = document.getElementById('alerteContact');

  const regexTel = /^(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}$/;
  const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let telSaisi = telInput.value.trim();
  let emailSaisi = emailInput.value.trim();

  let telValide = telSaisi === '' || regexTel.test(telSaisi);
  let emailValide = emailSaisi === '' || regexEmail.test(emailSaisi);

  telInput.classList.toggle('is-invalid', telSaisi !== '' && !telValide);
  telInput.classList.toggle('is-valid', telSaisi !== '' && telValide);
  emailInput.classList.toggle('is-invalid', emailSaisi !== '' && !emailValide);
  emailInput.classList.toggle('is-valid', emailSaisi !== '' && emailValide);

  let valide = (telSaisi !== '' && telValide) || (emailSaisi !== '' && emailValide);
  alerteContact.style.display = (!valide && telSaisi === '' && emailSaisi === '') ? 'block' : 'none';
  return (valide && telValide && emailValide);
}

/**
 * Valide et soumet le formulaire de réservation.
 */
function validerFormulaire() {
  const operationId = document.getElementById('operationSelect').value;
  if (!operationId || !document.getElementById('nomClient').value || !document.getElementById('prenomClient').value) {
    showToast("Veuillez sélectionner une offre et remplir Nom/Prénom.", "error");
    return;
  }
  if (!verifierContacts()) {
    document.getElementById('alerteContact').style.display = 'block';
    return;
  }

  const articlesSaisis = [];
  document.querySelectorAll('.ligne-produit').forEach(ligne => {
    const n = ligne.querySelector('.nom-article').value.trim();
    const q = ligne.querySelector('.quantite-article').value;
    if (n && q && parseInt(q) > 0) articlesSaisis.push({ nom: n, quantite: parseInt(q) });
  });

  const data = {
    operationId: operationId,
    nom: document.getElementById('nomClient').value.trim(),
    prenom: document.getElementById('prenomClient').value.trim(),
    telephone: document.getElementById('telClient').value.trim(),
    email: document.getElementById('emailClient').value.trim(),
    articles: articlesSaisis
  };

  const btn = document.getElementById('btnValiderFormulaire');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>...';

  google.script.run
    .withSuccessHandler(function() {
      showToast("<i class='bi bi-check-circle'></i> Réservation enregistrée !", "success");
      document.getElementById('formReservation').reset();
      document.getElementById('telClient').classList.remove('is-valid', 'is-invalid');
      document.getElementById('emailClient').classList.remove('is-valid', 'is-invalid');
      gererAffichageProduits();
      btn.disabled = false;
      btn.innerHTML = 'VÉRIFIER ET VALIDER';
      loadOperations();
    })
    .withFailureHandler(function(err) {
      showToast("Erreur : " + err.message, "error");
      btn.disabled = false;
      btn.innerHTML = 'VÉRIFIER ET VALIDER';
    })
    .saveReservation(data);
}

/**
 * Gère l'affichage des champs pour une nouvelle offre.
 * @param {string} prefix - Préfixe ('new' ou 'edit').
 */
function gererChampsNouvelleOffre(prefix) {
  const type = document.getElementById(prefix + 'OpType').value;
  const mode = document.getElementById(prefix + 'OpMode').value;
  document.getElementById('blocModeSaisie_' + prefix).style.display = (type === 'Evenement') ? 'none' : 'block';
  document.getElementById('blocArticlesPredefinis_' + prefix).style.display = (type === 'Produit' && mode === 'Predefini') ? 'block' : 'none';
  
  // Réinitialiser les listes d'articles si le mode change
  if (prefix === 'new') {
    newOpArticlesList = [];
    afficherListeArticles('new');
  } else {
    editOpArticlesList = [];
    afficherListeArticles('edit');
  }
}

/**
 * Ouvre la modal de création d'une nouvelle offre.
 */
function creerNouvelleOffre() {
  const modalOperations = bootstrap.Modal.getInstance(document.getElementById('modalOperations'));
  if (modalOperations) modalOperations.hide();
  document.getElementById('formNouvelleOffre').reset();
  newOpArticlesList = [];
  afficherListeArticles('new');
  gererChampsNouvelleOffre('new');
  new bootstrap.Modal(document.getElementById('modalCreerOffre')).show();
}

/**
 * Sauvegarde une nouvelle offre.
 */
function sauvegarderNouvelleOffre() {
  if (!document.getElementById('formNouvelleOffre').checkValidity()) {
    document.getElementById('formNouvelleOffre').reportValidity();
    return;
  }

  const type = document.getElementById('newOpType').value;
  const mode = type === 'Produit' ? document.getElementById('newOpMode').value : '';
  const data = {
    nom: document.getElementById('newOpNom').value.trim(),
    type: type,
    modeSaisie: mode,
    dateDebut: '',
    dateFin: '',
    articlesPredefinis: mode === 'Predefini' ? newOpArticlesList.join(',') : ''
  };

  const btn = document.getElementById('btnSauvegarderOffre');
  btn.disabled = true;

  google.script.run
    .withSuccessHandler(function() {
      const modal = bootstrap.Modal.getInstance(document.getElementById('modalCreerOffre'));
      if (modal) modal.hide();
      showToast("Nouvelle offre créée !", "success");
      btn.disabled = false;
      newOpArticlesList = [];
      loadOperations();
      new bootstrap.Modal(document.getElementById('modalOperations')).show();
    })
    .withFailureHandler(function(err) {
      showToast("Erreur : " + err.message, "error");
      btn.disabled = false;
    })
    .saveOperation(data);
}

/**
 * Affiche les détails d'une opération.
 * @param {string} idOperation - ID de l'opération.
 */
function voirReservationsDetail(idOperation) {
  const modalOperations = bootstrap.Modal.getInstance(document.getElementById('modalOperations'));
  if (modalOperations) modalOperations.hide();
  showToast("<span class='spinner-border spinner-border-sm'></span> Chargement des détails...", "info");

  google.script.run
    .withSuccessHandler(function(details) {
      currentOperationDetails = details;
      const op = details.operation;

      document.getElementById('detailModalTitle').innerHTML = `<i class="bi bi-box-seam"></i> ${op.nom}`;
      document.getElementById('editOpId').value = op.id;
      document.getElementById('editOpNom').value = op.nom;
      document.getElementById('editOpType').value = op.type;
      document.getElementById('editOpMode').value = op.modeSaisie;
      
      // Charger les articles prédéfinis dans la liste
      editOpArticlesList = op.articlesPredefinis ? op.articlesPredefinis.split(',').map(a => a.trim()).filter(a => a) : [];
      afficherListeArticles('edit');
      
      gererChampsNouvelleOffre('edit');

      const tbody = document.getElementById('tableInscritsBody');
      tbody.innerHTML = '';

      if (details.reservations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Aucun inscrit pour le moment.</td></tr>';
      } else {
        details.reservations.forEach(res => {
          let selectHtml = `
            <select class="form-select form-select-sm fw-bold border-secondary text-secondary" onchange="changerStatutReservation('${res.idRes}', this.value)">
              <option value="Réservé" ${res.etat === 'Réservé' ? 'selected' : ''}>Réservé</option>
              <option value="Contacté" ${res.etat === 'Contacté' ? 'selected' : ''}>Contacté</option>
              <option value="Retrait" ${res.etat === 'Retrait' ? 'selected' : ''}>Retrait</option>
              <option value="Annulé" ${res.etat === 'Annulé' ? 'selected' : ''}>Annulé</option>
            </select>
          `;

          tbody.innerHTML += `
            <tr>
              <td><span class="fw-bold">${res.nom} ${res.prenom}</span><br><small>Saisi le ${res.dateSaisie}</small></td>
              <td>${res.contact}</td>
              <td><small>${res.articlesText || '-'}</small></td>
              <td>${selectHtml}</td>
            </tr>
          `;
        });
      }
      new bootstrap.Modal(document.getElementById('modalDetailOffre')).show();
    })
    .withFailureHandler(function(err) {
      showToast("Erreur : " + err.message, "error");
    })
    .getOperationDetails(idOperation);
}

/**
 * Met à jour le statut d'une réservation.
 * @param {string} idRes - ID de la réservation.
 * @param {string} nouveauStatut - Nouveau statut.
 */
function changerStatutReservation(idRes, nouveauStatut) {
  showToast("<span class='spinner-border spinner-border-sm'></span> Mise à jour du statut...", "info");
  google.script.run
    .withSuccessHandler(function() {
      showToast("<i class='bi bi-check-circle'></i> Statut mis à jour !", "success");
      if (currentOperationDetails) {
        let resToUpdate = currentOperationDetails.reservations.find(r => r.idRes === idRes);
        if (resToUpdate) resToUpdate.etat = nouveauStatut;
      }
    })
    .withFailureHandler(function(err) {
      showToast("Erreur : " + err.message, "error");
    })
    .updateReservationStatus(idRes, nouveauStatut);
}

/**
 * Sauvegarde les modifications d'une offre.
 */
function sauvegarderModificationOffre() {
  const type = document.getElementById('editOpType').value;
  const mode = type === 'Produit' ? document.getElementById('editOpMode').value : '';
  const data = {
    id: document.getElementById('editOpId').value,
    nom: document.getElementById('editOpNom').value.trim(),
    type: type,
    modeSaisie: mode,
    dateDebut: '',
    dateFin: '',
    articlesPredefinis: mode === 'Predefini' ? editOpArticlesList.join(',') : ''
  };

  const btn = document.getElementById('btnUpdateOffre');
  btn.disabled = true;

  google.script.run
    .withSuccessHandler(function() {
      showToast("Offre mise à jour !", "success");
      btn.disabled = false;
      editOpArticlesList = [];
      loadOperations();
    })
    .withFailureHandler(function(err) {
      showToast("Erreur : " + err.message, "error");
      btn.disabled = false;
    })
    .updateOperation(data);
}

/**
 * Demande confirmation pour la suppression d'une opération.
 * @param {string} idOperation - ID de l'opération à supprimer.
 */
function demanderSuppression(idOperation) {
  window.idOffreASupprimer = idOperation;
  new bootstrap.Modal(document.getElementById('modalConfirmDelete')).show();
}

/**
 * Confirme et exécute la suppression d'une opération.
 */
function confirmerSuppression() {
  if (window.idOffreASupprimer) {
    const modal = bootstrap.Modal.getInstance(document.getElementById('modalConfirmDelete'));
    if (modal) modal.hide();

    google.script.run
      .withSuccessHandler(function() {
        showToast("Opération supprimée !", 'success');
        loadOperations();
      })
      .withFailureHandler(function(err) {
        showToast("Erreur : " + err.message, "error");
      })
      .deleteOperation(window.idOffreASupprimer);
  }
}

/**
 * Imprime le résumé des réservations pour une opération.
 */
function imprimerReservations() {
  if (!currentOperationDetails) return;

  const op = currentOperationDetails.operation;
  const res = currentOperationDetails.reservations;
  const resume = currentOperationDetails.resume;

  let html = `
    <div class="mb-4 text-center">
      <h2 class="mb-1">${op.nom}</h2>
      <p class="text-muted">Dates : Du ${op.dateDebut || '-' } au ${op.dateFin || '-'}</p>
    </div>
  `;

  if (resume && resume.length > 0) {
    html += `
      <h4 class="mb-2">Résumé des Produits à préparer</h4>
      <table class="table table-bordered border-dark mb-5">
        <thead class="table-light">
          <tr>
            <th>Désignation du produit</th>
            <th style="width: 150px" class="text-center">Quantité Totale</th>
          </tr>
        </thead>
        <tbody>
    `;
    resume.forEach(r => {
      html += `<tr><td>${r.nom}</td><td class="fw-bold text-center fs-5">${r.total}</td></tr>`;
    });
    html += `</tbody></table>`;
  }

  html += `
    <h4 class="mb-2">Liste des Commandes (${res.length})</h4>
    <table class="table table-bordered border-dark">
      <thead class="table-light">
        <tr>
          <th>Nom & Prénom</th>
          <th>Contact</th>
          <th>Détail de la commande</th>
          <th>État</th>
        </tr>
      </thead>
      <tbody>
  `;

  if (res.length === 0) {
    html += `<tr><td colspan="4" class="text-center">Aucune réservation pour le moment.</td></tr>`;
  } else {
    res.forEach(r => {
      html += `<tr>
        <td><strong>${r.nom} ${r.prenom}</strong><br><small class="text-muted">${r.dateSaisie}</small></td>
        <td>${r.contact}</td>
        <td>${r.articlesText || '-'}</td>
        <td class="text-center"><strong>${r.etat}</strong></td>
      </tr>`;
    });
  }

  html += `</tbody></table>`;

  const zoneImpression = document.getElementById('zoneImpression');
  zoneImpression.innerHTML = html;
  zoneImpression.classList.remove('d-none');

  window.print();
  setTimeout(() => {
    zoneImpression.classList.add('d-none');
    zoneImpression.innerHTML = "";
  }, 1000);
}

/**
 * Affiche une notification toast.
 * @param {string} message - Message à afficher.
 * @param {string} [type='success'] - Type de toast ('success', 'error', 'info').
 */
function showToast(message, type = 'success') {
  const toastEl = document.getElementById('appToast');
  toastEl.className = `toast align-items-center border-0 text-white ${type === 'success' ? 'bg-success' : (type === 'info' ? 'bg-info' : 'bg-danger')}`;
  document.getElementById('toastMessage').innerHTML = message;
  new bootstrap.Toast(toastEl, { delay: 4000 }).show();
}

/**
 * Ouvre la modal des mentions légales.
 */
function ouvrirMentions() {
  new bootstrap.Modal(document.getElementById('modalMentions')).show();
}

/**
 * Ouvre la modal d'aide.
 */
function ouvrirAide() {
  const panneauAide = document.getElementById('offcanvasHelp');
  const offcanvas = new bootstrap.Offcanvas(panneauAide);
  offcanvas.show();
}

/**
 * Ouvre la modal de gestion des opérations.
 */
function ouvrirOperations() {
  new bootstrap.Modal(document.getElementById('modalOperations')).show();
}
