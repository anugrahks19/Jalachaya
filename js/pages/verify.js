/* JALACHAYA - Citizen: community verification of completed work */

const session = Auth.requireRole(ROLES.CITIZEN);
let currentVerification = null; // { taskId, decision, code }
let verifyPicker = null;

if (session) {
  UI.initDashboard(session);
  verifyPicker = UI.photoPicker(document.getElementById('verifyPhoto'), { max: 1 });
  document.getElementById('verifyForm').addEventListener('submit', submitVerification);
  loadVerifications();
  Live.start(loadVerifications, { statusId: 'liveStatus' });
}

async function loadVerifications() {
  const list = document.getElementById('verifyList');
  try {
    const items = await API.getPendingVerifications();
    const fresh = Live.diff('verifications', items.map(function (v) { return v.taskId; }));
    if (fresh.length) UI.toast(fresh.length + ' new piece' + (fresh.length > 1 ? 's' : '') + ' of work to verify');
    if (items.length === 0) {
      list.innerHTML = '<div class="card">' + UI.emptyState('There is no completed work waiting for verification right now.') + '</div>';
      return;
    }

    list.innerHTML = items.map(function (v) {
      let actions;
      if (v.myResponse) {
        actions = '<div class="alert alert-success mb-0 mt-2">You responded: <strong>' +
          (v.myResponse.decision === 'CONFIRM' ? 'Confirmed' : 'Disputed') + '</strong>' +
          (v.myResponse.comment ? ' - ' + UI.escape(v.myResponse.comment) : '') + '</div>';
      } else {
        actions = '<div class="verify-actions">' +
          '<button type="button" class="btn" data-task="' + v.taskId + '" data-code="' + UI.escape(v.code) + '" data-decision="CONFIRM">Yes, it is resolved</button>' +
          '<button type="button" class="btn btn-outline" data-task="' + v.taskId + '" data-code="' + UI.escape(v.code) + '" data-decision="DISPUTE">No, still a problem</button>' +
          '</div>';
      }

      const evidence = v.evidence || {};
      return '<article class="task-card">' +
        '<div class="task-card-head">' +
          '<div><h3>' + UI.escape(v.pondName) + ' &middot; ' + UI.escape(UI.categoryLabel(v.category)) + '</h3>' +
          '<div class="muted small">' + UI.escape(v.code) + (v.reportedByMe ? ' &middot; reported by you' : '') + '</div></div>' +
          UI.statusBadge('COMMUNITY_VERIFICATION') +
        '</div>' +
        '<p class="small"><strong>Original problem:</strong> ' + UI.escape(v.description) +
          (v.landmark ? ' <span class="muted">(' + UI.escape(v.landmark) + ')</span>' : '') + '</p>' +
        '<div class="evidence-grid">' +
          UI.photo(evidence.beforeImageUrl, 'Before work', 'No before photo') +
          UI.photo(evidence.afterImageUrl, 'After work', 'No after photo') +
        '</div>' +
        '<p class="small mt-1 mb-0"><strong>Field team remarks:</strong> ' + UI.escape(evidence.remarks || '-') +
          ' <span class="muted">&middot; submitted ' + UI.formatDate(evidence.submittedAt) + '</span></p>' +
        actions +
        '</article>';
    }).join('');

    list.querySelectorAll('[data-decision]').forEach(function (button) {
      button.addEventListener('click', function () {
        openVerifyDialog(Number(button.dataset.task), button.dataset.decision, button.dataset.code);
      });
    });
  } catch (error) {
    list.innerHTML = '<div class="alert alert-error">Could not load verification requests.</div>';
    UI.showError(error);
  }
}

function openVerifyDialog(taskId, decision, code) {
  currentVerification = { taskId: taskId, decision: decision, code: code };
  const isConfirm = decision === 'CONFIRM';
  document.getElementById('verifyDialogTitle').textContent = isConfirm ? 'Confirm work is done' : 'Dispute this work';
  document.getElementById('verifyDialogText').textContent = isConfirm
    ? 'You are confirming that the problem in ' + code + ' appears resolved.'
    : 'Tell the Panchayat what is still wrong. The complaint ' + code + ' will be reopened.';
  document.getElementById('verifyCommentLabel').innerHTML = isConfirm
    ? 'Comment <span class="optional">(optional)</span>'
    : 'What is still wrong?';
  document.getElementById('verifyComment').value = '';
  document.getElementById('verifyPhotoHint').textContent = isConfirm
    ? 'You can add a current photo showing the cleaned area.'
    : 'A current photo helps the Panchayat see what is still wrong.';
  verifyPicker.clear();
  UI.clearFieldErrors(document.getElementById('verifyForm'));
  UI.openDialog('verifyDialog');
}

async function submitVerification(event) {
  event.preventDefault();
  const form = document.getElementById('verifyForm');
  const commentInput = document.getElementById('verifyComment');
  const button = document.getElementById('verifySubmitBtn');
  UI.clearFieldErrors(form);

  const comment = commentInput.value.trim();
  if (currentVerification.decision === 'DISPUTE' && comment.length < 5) {
    UI.showFieldError(commentInput, 'Please describe what is still wrong (at least 5 characters).');
    return;
  }

  UI.setLoading(button, true, 'Submitting...');
  try {
    const formData = new FormData();
    formData.append('taskId', currentVerification.taskId);
    formData.append('decision', currentVerification.decision);
    formData.append('comment', comment);
    const photos = verifyPicker.getPhotos();
    if (photos.length) formData.append('image', photos[0].blob, 'verification-photo.jpg');
    await API.submitCommunityVerification(formData);
    UI.closeDialog('verifyDialog');
    UI.toast(currentVerification.decision === 'CONFIRM'
      ? currentVerification.code + ' confirmed. Thank you.'
      : currentVerification.code + ' has been reopened.');
    loadVerifications();
  } catch (error) {
    UI.showError(error);
  } finally {
    UI.setLoading(button, false);
  }
}
