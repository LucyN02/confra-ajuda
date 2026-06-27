// --- GLOBAL STATE ---
let activeDonationId = null;
let pollingInterval = null;
let timerInterval = null;
const API_BASE = window.location.port === '8080' ? '' : 'https://confra-ajuda-production.up.railway.app';

// --- DOM ELEMENTS ---
const campaignsContainer = document.getElementById('campaigns-container');
const donationModal = document.getElementById('donation-modal');
const btnCloseModal = document.getElementById('btn-close-modal');

// Steps
const stepForm = document.getElementById('step-form');
const stepPayment = document.getElementById('step-payment');
const stepSuccess = document.getElementById('step-success');

// Form Inputs
const donationForm = document.getElementById('donation-form');
const inputCampaignId = document.getElementById('input-campaign-id');
const modalCampaignTitle = document.getElementById('modal-campaign-title');
const inputName = document.getElementById('input-name');
const inputDocument = document.getElementById('input-document');
const inputAmount = document.getElementById('input-amount');

// Payment Screen Elements
const pixQrImage = document.getElementById('pix-qr-image');
const pixAmountDisplay = document.getElementById('pix-amount-display');
const inputCopiaCola = document.getElementById('input-copia-cola');
const btnCopyPix = document.getElementById('btn-copy-pix');
const timerDisplay = document.getElementById('timer-display');
const btnSimulatePayment = document.getElementById('btn-simulate-payment');

// Success Screen Elements
const receiptDonorName = document.getElementById('receipt-donor-name');
const receiptAmount = document.getElementById('receipt-amount');
const receiptId = document.getElementById('receipt-id');
const btnFinishDonation = document.getElementById('btn-finish-donation');

// Toast Notification
const toastNotification = document.getElementById('toast-notification');
const toastMessage = document.getElementById('toast-message');

// --- INIT APP ---
document.addEventListener('DOMContentLoaded', () => {
    loadCampaigns();
    setupEventListeners();
});

// --- EVENT LISTENERS ---
function setupEventListeners() {
    btnCloseModal.addEventListener('click', closeModal);
    
    // Form submission
    donationForm.addEventListener('submit', handleDonationSubmit);
    
    // Copy Pix Button
    btnCopyPix.addEventListener('click', copyPixToClipboard);
    
    // Simulate webhook confirmation button
    btnSimulatePayment.addEventListener('click', simulatePaymentConfirmation);
    
    // Finish / Close Success step
    btnFinishDonation.addEventListener('click', () => {
        closeModal();
        loadCampaigns(); // Reload progress bars
    });

    // Close modal clicking outside
    donationModal.addEventListener('click', (e) => {
        if (e.target === donationModal) {
            closeModal();
        }
    });
}

// --- API METHODS ---

// Fetch campaigns list
async function loadCampaigns() {
    try {
        const response = await fetch(`${API_BASE}/api/campaigns`);
        if (!response.ok) throw new Error('Falha ao buscar campanhas');
        const campaigns = await response.json();
        
        renderCampaigns(campaigns);
    } catch (error) {
        console.error(error);
        campaignsContainer.innerHTML = `
            <div class="error-state" style="grid-column: 1/-1; text-align: center; padding: 40px;">
                <i class="fa-solid fa-circle-exclamation" style="font-size: 3rem; color: #ff5e62; margin-bottom: 15px;"></i>
                <h4>Erro ao Conectar com o Servidor Kotlin</h4>
                <p style="color: var(--text-secondary); margin-top: 8px;">Certifique-se de que o backend Ktor está rodando na porta 8080.</p>
            </div>
        `;
    }
}

// Render campaign cards
function renderCampaigns(campaigns) {
    if (campaigns.length === 0) {
        campaignsContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">Nenhuma campanha disponível.</p>';
        return;
    }

    campaignsContainer.innerHTML = campaigns.map(campaign => {
        const percent = Math.min(Math.round((campaign.currentAmount / campaign.targetAmount) * 100), 100);
        
        // Define decorative icon based on ID
        let icon = 'fa-solid fa-seedling';
        if (campaign.id === 'abrigo-patinhas') icon = 'fa-solid fa-paw';
        if (campaign.id === 'biblioteca-bairro') icon = 'fa-solid fa-book-open';

        return `
            <div class="campaign-card">
                <div class="card-header-decor">
                    <span class="card-category">${campaign.category}</span>
                    <i class="${icon} card-decor-icon"></i>
                </div>
                <div class="card-body">
                    <h4 class="card-title">${campaign.title}</h4>
                    <p class="card-desc">${campaign.description}</p>
                    
                    <div class="progress-area">
                        <div class="progress-info">
                            <span class="progress-raised">R$ ${campaign.currentAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            <span class="progress-target">Meta: R$ ${campaign.targetAmount.toLocaleString('pt-BR')}</span>
                        </div>
                        <div class="progress-track">
                            <div class="progress-bar" style="width: ${percent}%"></div>
                        </div>
                        <div style="text-align: right; font-size: 0.75rem; color: var(--text-muted); margin-top: 5px;">
                            ${percent}% da meta alcançada
                        </div>
                    </div>
                    
                    <button class="btn btn-primary btn-block" onclick="openDonationModal('${campaign.id}', '${campaign.title}')">
                        Apoiar Campanha <i class="fa-solid fa-heart"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Open modal and set target campaign
window.openDonationModal = function(campaignId, campaignTitle) {
    inputCampaignId.value = campaignId;
    modalCampaignTitle.innerText = campaignTitle;
    
    // Reset form inputs
    inputName.value = '';
    inputDocument.value = '';
    inputAmount.value = '';
    
    // Show step 1
    showStep(stepForm);
    
    donationModal.classList.add('active');
};

// Close modal & clean up routines
function closeModal() {
    donationModal.classList.remove('active');
    
    // Stop any running intervals
    if (pollingInterval) clearInterval(pollingInterval);
    if (timerInterval) clearInterval(timerInterval);
    
    activeDonationId = null;
}

// Show specific step and hide others
function showStep(stepElement) {
    [stepForm, stepPayment, stepSuccess].forEach(step => {
        step.classList.add('hidden');
    });
    stepElement.classList.remove('hidden');
}

// Handle Form Submit to create Pix
async function handleDonationSubmit(e) {
    e.preventDefault();
    
    const campaignId = inputCampaignId.value;
    const customerName = inputName.value.trim();
    const customerDocument = inputDocument.value.replace(/\D/g, ''); // Extract numbers only
    const amount = parseFloat(inputAmount.value);
    
    if (customerDocument.length !== 11 && customerDocument.length !== 14) {
        showToast('CPF deve ter 11 dígitos ou CNPJ deve ter 14 dígitos.');
        return;
    }
    
    const submitBtn = document.getElementById('btn-submit-donation');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando Pix seguro...';
    
    try {
        const response = await fetch(`${API_BASE}/api/donate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                campaignId,
                customerName,
                customerDocument,
                amount
            })
        });
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Erro ao processar doação.');
        }
        
        const donationData = await response.json();
        
        setupPaymentScreen(donationData);
    } catch (error) {
        console.error(error);
        showToast(error.message || 'Falha ao conectar ao servidor.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

// Setup payment screen (Step 2)
function setupPaymentScreen(donation) {
    activeDonationId = donation.id;
    
    // Show amount formatted
    pixAmountDisplay.innerText = donation.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    // Set copia e cola input value
    inputCopiaCola.value = donation.pixCode;
    
    // Generate QR Code image using a free public generator (QR Server API)
    // We encode the pixCode string so it's a valid URL parameter
    const qrSize = 250;
    pixQrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(donation.pixCode)}`;
    
    // Show step 2
    showStep(stepPayment);
    
    // Start countdown timer (1h)
    startTimer(3600);
    
    // Start polling status
    startStatusPolling(donation.id);
}

// Copy Pix code to clipboard
function copyPixToClipboard() {
    inputCopiaCola.select();
    inputCopiaCola.setSelectionRange(0, 99999); // For mobile devices
    
    navigator.clipboard.writeText(inputCopiaCola.value)
        .then(() => {
            showToast('Código Pix Copia e Cola copiado!');
            const originalIcon = btnCopyPix.innerHTML;
            btnCopyPix.innerHTML = '<i class="fa-solid fa-check"></i> Copiado';
            setTimeout(() => {
                btnCopyPix.innerHTML = originalIcon;
            }, 2000);
        })
        .catch(err => {
            console.error('Falha ao copiar: ', err);
            showToast('Erro ao copiar código.');
        });
}

// Poll transaction status from backend
function startStatusPolling(donationId) {
    if (pollingInterval) clearInterval(pollingInterval);
    
    pollingInterval = setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE}/api/status/${donationId}`);
            if (!response.ok) return; // Ignore brief network drops during polling
            
            const donation = await response.json();
            
            if (donation.status === 'succeeded') {
                clearInterval(pollingInterval);
                showSuccessScreen(donation);
            }
        } catch (error) {
            console.warn('Erro na consulta de status: ', error);
        }
    }, 2000); // Poll every 2 seconds
}

// Simulate webhook payment approval
async function simulatePaymentConfirmation() {
    if (!activeDonationId) return;
    
    const originalText = btnSimulatePayment.innerHTML;
    btnSimulatePayment.disabled = true;
    btnSimulatePayment.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Confirmando...';
    
    try {
        const response = await fetch(`${API_BASE}/api/confirm/${activeDonationId}`, {
            method: 'POST'
        });
        
        if (response.ok) {
            const donation = await response.json();
            if (donation.status === 'succeeded') {
                if (pollingInterval) clearInterval(pollingInterval);
                showSuccessScreen(donation);
            }
        }
    } catch (error) {
        console.error(error);
        showToast('Erro ao simular confirmação.');
    } finally {
        btnSimulatePayment.disabled = false;
        btnSimulatePayment.innerHTML = originalText;
    }
}

// Display Success Receipt Screen (Step 3)
function showSuccessScreen(donation) {
    // Stop timer
    if (timerInterval) clearInterval(timerInterval);
    
    receiptDonorName.innerText = donation.customerName;
    receiptAmount.innerText = donation.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    receiptId.innerText = donation.id;
    
    showStep(stepSuccess);
    
    // Play a nice success sound if desired, or trigger browser effects
    showToast('Doação recebida com sucesso! Obrigado.');
}

// 1h expiration timer display helper
function startTimer(durationSeconds) {
    if (timerInterval) clearInterval(timerInterval);
    
    let timer = durationSeconds;
    
    timerInterval = setInterval(() => {
        const minutes = parseInt(timer / 60, 10);
        const seconds = parseInt(timer % 60, 10);

        const minutesStr = minutes < 10 ? "0" + minutes : minutes;
        const secondsStr = seconds < 10 ? "0" + seconds : seconds;

        timerDisplay.innerText = minutesStr + ":" + secondsStr;

        if (--timer < 0) {
            clearInterval(timerInterval);
            clearInterval(pollingInterval);
            closeModal();
            showToast('A cobrança Pix expirou. Tente novamente.');
        }
    }, 1000);
}

// Show quick alert toast
function showToast(message) {
    toastMessage.innerText = message;
    toastNotification.classList.add('show');
    
    setTimeout(() => {
        toastNotification.classList.remove('show');
    }, 4000);
}
