const settingSchema = new mongoose.Schema({
    name: String,
    value: String
  });
  
  const Setting = mongoose.model('Setting', settingSchema);
  