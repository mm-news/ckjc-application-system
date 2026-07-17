class Applicant {
  /**
   * 創建一個聲請人實例
   * @param {string} jobTitle 聲請人職務
   * @param {string} name 聲請人姓名
   * @param {boolean} hideName 須隱匿姓名
   * @param {string|null} classId 班級（訴訟類使用，否則為 null）
   * @param {string|null} studentId 學號（訴訟類使用，否則為 null）
   * @param {string} email 聲請人 email
   */
  constructor(jobTitle, name, hideName, classId, studentId, email) {
    this.jobTitle = jobTitle;
    this.name = name;
    this.hideName = hideName;
    this.classId = classId;
    this.studentId = studentId;
    this.email = email;
  }
}
