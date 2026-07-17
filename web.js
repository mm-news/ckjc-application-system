const APPLICATION_TYPES = ["resolution", "charter", "lawsuit"];
const ALLOWS_HIDE_NAME = ['resolution'];
// 機關聲請時，職稱自動視為此值
const AGENCY_JOB_TITLE = "機關";

function doGet(e) {
  let template = HtmlService.createTemplateFromFile("index");
  return template.evaluate().setTitle("評議委員會線上聲請系統").setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function submitApplication(payload) {
  try {
    if (!payload || !payload.applicationType || !APPLICATION_TYPES.includes(payload.applicationType)) {
      throw new Error("聲請類別無效");
    }

    let applicationLink = null;
    let isUploadedFile = false;

    if (payload.submissionMode === "link" && payload.sharedLink) {
      applicationLink = validateSharedLink(payload.sharedLink);
    } else if (payload.submissionMode === "file" && payload.fileData && payload.fileName && payload.mimeType) {
      applicationLink = saveFileToDrive(payload.fileData, payload.fileName, payload.mimeType);
      isUploadedFile = true;
    }

    // 機關聲請：職稱自動視為「機關」，且班級、學號非必填
    // （與 REQUIRES_CLASS_STUDENT 並立，仍可送出所有類型的表單）。
    const isAgency = payload.isAgency === true;

    const applicant = new Applicant(
      isAgency ? AGENCY_JOB_TITLE : payload.jobTitle,
      payload.name,
      !isAgency && ALLOWS_HIDE_NAME.includes(payload.applicationType) ? payload.hideName : false,
      isAgency ? null : (payload.classId || null),
      isAgency ? null : (payload.studentId || null),
      payload.email
    );

    const [internalCaseId, externalCaseId] = insertNewRow(payload.applicationType, payload.subject, payload.detail, applicant, applicationLink);

    if (applicationLink && isUploadedFile) {
      moveFileToCaseFolder(applicationLink, internalCaseId);
    }

    sendNotificationEmail(
      externalCaseId,
      payload.applicationType,
      payload.subject,
      payload.detail,
      applicant,
      applicationLink
    );

    return { success: true, caseId: externalCaseId };
  } catch (error) {
    console.warn("Error in submitApplication:", error);
    return { success: false, message: error.message };
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}