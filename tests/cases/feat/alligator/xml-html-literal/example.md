// HTML Tags - Should remain literal (no . * @)
/var @html1 = "HTML: <div>content</div>"
/var @html2 = "Form: <input type='text' name='email'>"
/var @html3 = "Link: <a href='#'>click here</a>"

// XML Content - Should remain literal  
/var @xml1 = "XML: <user><name>John</name></user>"
/var @xml2 = "Config: <database><host>localhost</host></database>"
/var @xml3 = "Empty: <tag/>"

/show @html1
/show @html2  
/show @html3
/show @xml1
/show @xml2
/show @xml3